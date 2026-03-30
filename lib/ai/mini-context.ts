// ── Full Context Builder for AI Command ────────────────────────────────────
// Gives the model actual names, IDs context, and workspace state
// so it never has to guess project names or team members.

import { supabaseAdmin } from "@/lib/supabase/admin"

export async function buildMiniContext(founderId: string): Promise<string> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1)
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [
    profileRes,
    tasksRes,
    projectsRes,
    teamRes,
    dealsRes,
    eventsRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", founderId)
      .single(),

    supabaseAdmin
      .from("tasks")
      .select("id, title, status, priority, due_date, assigned_to, bucket, project_id, is_completed")
      .eq("user_id", founderId)
      .eq("is_completed", false)
      .order("created_at", { ascending: false })
      .limit(50),

    supabaseAdmin
      .from("projects")
      .select("id, name, status, priority, end_date")
      .eq("founder_id", founderId)
      .order("updated_at", { ascending: false }),

    supabaseAdmin
      .from("team_members")
      .select("user_id, position, is_active, profile:profiles!team_members_user_id_profiles_fkey(full_name)")
      .eq("founder_id", founderId)
      .eq("is_active", true),

    supabaseAdmin
      .from("relationships")
      .select("id, deal_value, pipeline_stage")
      .eq("user_id", founderId)
      .eq("status", "active"),

    supabaseAdmin
      .from("events")
      .select("id, title, start_time")
      .eq("user_id", founderId)
      .gte("start_time", now.toISOString())
      .lte("start_time", weekEnd.toISOString())
      .order("start_time", { ascending: true })
      .limit(5),
  ])

  const profile = profileRes.data
  const tasks = tasksRes.data || []
  const projects = projectsRes.data || []
  const team = (teamRes.data || []) as any[]
  const deals = dealsRes.data || []
  const events = eventsRes.data || []

  // Task counts per team member for workload
  const taskCountByMember: Record<string, number> = {}
  for (const t of tasks) {
    if (t.assigned_to) {
      taskCountByMember[t.assigned_to] = (taskCountByMember[t.assigned_to] || 0) + 1
    }
  }

  // Project map for task display
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]))

  // Assignee map
  const assigneeMap: Record<string, string> = {}
  for (const m of team) {
    assigneeMap[m.user_id] = m.profile?.full_name || "Unknown"
  }

  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < now)
  const todayTasks = tasks.filter(t => t.due_date && new Date(t.due_date) >= todayStart && new Date(t.due_date) <= todayEnd)
  const activeDeals = deals.filter(d => !["closed_won", "closed_lost"].includes(d.pipeline_stage))
  const pipelineValue = activeDeals.reduce((s, d) => s + (d.deal_value || 0), 0)

  const lines: string[] = []

  // Identity + date
  lines.push(`Founder: ${profile?.full_name || "Unknown"}`)
  lines.push(`Today: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`)

  // Stats line
  lines.push(`Tasks: ${tasks.length} active, ${overdueTasks.length} overdue, ${todayTasks.length} due today`)
  lines.push(`Pipeline: ${activeDeals.length} deals | $${pipelineValue.toLocaleString()}`)
  lines.push(`Calendar: ${events.length} events this week`)

  // ── PROJECTS — full list with exact names ──────────────────────────────
  lines.push(`\n## Projects (${projects.length}) — use EXACT names when referencing`)
  if (projects.length === 0) {
    lines.push("No projects yet.")
  } else {
    for (const p of projects) {
      const taskCount = tasks.filter(t => t.project_id === p.id).length
      const deadline = p.end_date ? ` | deadline ${new Date(p.end_date).toLocaleDateString()}` : ""
      lines.push(`- "${p.name}" | ${p.status} | ${p.priority} priority | ${taskCount} active tasks${deadline}`)
    }
  }

  // ── TEAM — full list with workload ─────────────────────────────────────
  lines.push(`\n## Team Members (${team.length}) — use EXACT names when assigning`)
  if (team.length === 0) {
    lines.push("No team members yet.")
  } else {
    const sorted = [...team].sort((a, b) =>
      (taskCountByMember[a.user_id] || 0) - (taskCountByMember[b.user_id] || 0)
    )
    for (const m of sorted) {
      const count = taskCountByMember[m.user_id] || 0
      const load = count === 0 ? "FREE" : count <= 3 ? "LIGHT" : count <= 6 ? "MODERATE" : "HEAVY"
      lines.push(`- "${m.profile?.full_name}" | ${m.position} | ${count} tasks [${load}]`)
    }
  }

  // ── ACTIVE TASKS — so model can find existing tasks ────────────────────
  lines.push(`\n## Active Tasks (${tasks.length}) — reference these EXACT titles for updates`)
  if (tasks.length === 0) {
    lines.push("No active tasks.")
  } else {
    for (const t of tasks.slice(0, 40)) {
      const assignee = t.assigned_to ? ` | →${assigneeMap[t.assigned_to] || "assigned"}` : ""
      const project = t.project_id ? ` | [${projectMap[t.project_id] || t.project_id}]` : ""
      const due = t.due_date ? ` | due ${new Date(t.due_date).toLocaleDateString()}` : ""
      const overdue = t.due_date && new Date(t.due_date) < now ? " ⚠OVERDUE" : ""
      lines.push(`- "${t.title}" | ${t.status} | ${t.priority}${due}${overdue}${assignee}${project}`)
    }
  }

  // ── UPCOMING EVENTS ────────────────────────────────────────────────────
  if (events.length > 0) {
    lines.push(`\n## Upcoming Events`)
    for (const e of events) {
      const date = new Date(e.start_time).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
      })
      lines.push(`- ${e.title} | ${date}`)
    }
  }

  return lines.join("\n")
}