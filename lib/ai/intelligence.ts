// The Thinker — risk detection, priority engine, bottleneck detection
import { supabaseAdmin } from "@/lib/supabase/admin"
import { withCache, CK } from "@/lib/redis"

export interface WorkspaceRisk {
  type: "overdue_task" | "blocked_task" | "stale_deal" | "overloaded_member" | "project_at_risk"
  severity: "critical" | "high" | "medium"
  title: string
  detail: string
  entity_id: string
  entity_type: string
}

export interface PriorityItem {
  rank: number
  reason: string
  action: string
  entity_id: string
  entity_type: "task" | "deal" | "project"
}

export interface WorkspaceIntelligence {
  risks: WorkspaceRisk[]
  priorities: PriorityItem[]
  bottlenecks: string[]
  teamStatus: Array<{ name: string; load: "FREE" | "LIGHT" | "MODERATE" | "HEAVY"; overdue: number }>
  generatedAt: string
}

export async function analyzeWorkspace(founderId: string): Promise<WorkspaceIntelligence> {
  return withCache(`intel:${founderId}`, 120, () => _analyze(founderId))
}

async function _analyze(founderId: string): Promise<WorkspaceIntelligence> {
  const now = new Date()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)

  const [tasksRes, dealsRes, membersRes, projectsRes] = await Promise.all([
    supabaseAdmin
      .from("tasks")
      .select("id, title, status, priority, due_date, assigned_to, project_id, is_completed")
      .eq("user_id", founderId)
      .eq("is_completed", false),

    supabaseAdmin
      .from("relationships")
      .select("id, full_name, company, pipeline_stage, deal_value, stage_entered_at, close_probability")
      .eq("user_id", founderId)
      .eq("status", "active")
      .not("pipeline_stage", "in", '("closed_won","closed_lost")'),

    supabaseAdmin
      .from("team_members")
      .select("user_id, position, profile:profiles!team_members_user_id_profiles_fkey(full_name)")
      .eq("founder_id", founderId)
      .eq("is_active", true),

    supabaseAdmin
      .from("projects")
      .select("id, name, status, priority, end_date")
      .eq("founder_id", founderId)
      .eq("status", "active"),
  ])

  const tasks = tasksRes.data || []
  const deals = dealsRes.data || []
  const members = membersRes.data || []
  const projects = projectsRes.data || []

  // ── Task counts per member ───────────────────────────────────────────────
  const memberTaskMap: Record<string, { active: number; overdue: number; blocked: number }> = {}
  for (const t of tasks) {
    if (!t.assigned_to) continue
    if (!memberTaskMap[t.assigned_to]) memberTaskMap[t.assigned_to] = { active: 0, overdue: 0, blocked: 0 }
    memberTaskMap[t.assigned_to].active++
    if (t.due_date && new Date(t.due_date) < now) memberTaskMap[t.assigned_to].overdue++
    if (t.status === "blocked") memberTaskMap[t.assigned_to].blocked++
  }

  // ── Task counts per project ──────────────────────────────────────────────
  const projectTaskMap: Record<string, { overdue: number; blocked: number; total: number }> = {}
  for (const t of tasks) {
    if (!t.project_id) continue
    if (!projectTaskMap[t.project_id]) projectTaskMap[t.project_id] = { overdue: 0, blocked: 0, total: 0 }
    projectTaskMap[t.project_id].total++
    if (t.due_date && new Date(t.due_date) < now) projectTaskMap[t.project_id].overdue++
    if (t.status === "blocked") projectTaskMap[t.project_id].blocked++
  }

  const risks: WorkspaceRisk[] = []
  const bottlenecks: string[] = []

  // ── Detect overdue tasks ─────────────────────────────────────────────────
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < now)
  for (const t of overdueTasks.slice(0, 5)) {
    const daysLate = Math.floor((now.getTime() - new Date(t.due_date!).getTime()) / 86400000)
    risks.push({
      type: "overdue_task",
      severity: daysLate > 7 ? "critical" : daysLate > 3 ? "high" : "medium",
      title: t.title,
      detail: `Overdue by ${daysLate} day${daysLate > 1 ? "s" : ""}`,
      entity_id: t.id,
      entity_type: "task",
    })
  }

  // ── Detect blocked tasks ─────────────────────────────────────────────────
  const blockedTasks = tasks.filter(t => t.status === "blocked")
  for (const t of blockedTasks) {
    risks.push({
      type: "blocked_task",
      severity: t.priority === "urgent" ? "critical" : "high",
      title: t.title,
      detail: `Blocked${t.project_id ? ` — affecting project` : ""}`,
      entity_id: t.id,
      entity_type: "task",
    })
  }

  // ── Detect stale deals ───────────────────────────────────────────────────
  for (const d of deals) {
    if (d.stage_entered_at && new Date(d.stage_entered_at) < fourteenDaysAgo) {
      const daysStale = Math.floor((now.getTime() - new Date(d.stage_entered_at).getTime()) / 86400000)
      risks.push({
        type: "stale_deal",
        severity: d.deal_value && d.deal_value > 5000 ? "high" : "medium",
        title: d.full_name + (d.company ? ` (${d.company})` : ""),
        detail: `${daysStale} days in ${d.pipeline_stage.replace(/_/g, " ")} — no movement`,
        entity_id: d.id,
        entity_type: "deal",
      })
    }
  }

  // ── Detect overloaded members ────────────────────────────────────────────
  for (const m of members) {
    const counts = memberTaskMap[m.user_id]
    if (counts && counts.active > 8) {
      risks.push({
        type: "overloaded_member",
        severity: counts.active > 12 ? "critical" : "high",
        title: (m.profile as any)?.full_name || "Team member",
        detail: `${counts.active} active tasks, ${counts.overdue} overdue`,
        entity_id: m.user_id,
        entity_type: "team_member",
      })
    }
  }

  // ── Detect at-risk projects ──────────────────────────────────────────────
  for (const p of projects) {
    const tc = projectTaskMap[p.id]
    if (!tc) continue
    const overdueRatio = tc.total > 0 ? tc.overdue / tc.total : 0
    if (tc.blocked > 0 || overdueRatio > 0.4) {
      const deadlineSoon = p.end_date && new Date(p.end_date) < new Date(Date.now() + 7 * 86400000)
      risks.push({
        type: "project_at_risk",
        severity: tc.blocked > 0 && deadlineSoon ? "critical" : "high",
        title: p.name,
        detail: `${tc.overdue} overdue, ${tc.blocked} blocked${deadlineSoon ? " — deadline this week" : ""}`,
        entity_id: p.id,
        entity_type: "project",
      })
      if (tc.blocked > 0) {
        const blockingTask = tasks.find(t => t.project_id === p.id && t.status === "blocked")
        if (blockingTask) {
          bottlenecks.push(`${p.name} is delayed — "${blockingTask.title}" is blocked with no progress`)
        }
      }
    }
  }

  // ── Priority engine ──────────────────────────────────────────────────────
  const priorities: PriorityItem[] = []

  // Sort risks by severity
  const criticalRisks = risks.filter(r => r.severity === "critical")
  for (const [i, r] of criticalRisks.slice(0, 3).entries()) {
    priorities.push({
      rank: i + 1,
      reason: r.detail,
      action: r.type === "blocked_task" ? "Unblock this task" :
              r.type === "overdue_task" ? "Complete or reassign" :
              r.type === "stale_deal" ? "Follow up immediately" : "Review and act",
      entity_id: r.entity_id,
      entity_type: r.entity_type === "task" ? "task" : r.entity_type === "deal" ? "deal" : "project",
    })
  }

  // ── Team status ──────────────────────────────────────────────────────────
  const teamStatus = members.map((m: any) => {
    const counts = memberTaskMap[m.user_id] || { active: 0, overdue: 0, blocked: 0 }
    const load =
      counts.active === 0 ? "FREE" :
      counts.active <= 3 ? "LIGHT" :
      counts.active <= 7 ? "MODERATE" : "HEAVY"
    return {
      name: m.profile?.full_name || "Unknown",
      load: load as "FREE" | "LIGHT" | "MODERATE" | "HEAVY",
      overdue: counts.overdue,
    }
  })

  return {
    risks: risks.sort((a, b) => {
      const s = { critical: 0, high: 1, medium: 2 }
      return s[a.severity] - s[b.severity]
    }),
    priorities,
    bottlenecks,
    teamStatus,
    generatedAt: now.toISOString(),
  }
}