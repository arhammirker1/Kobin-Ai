import { supabaseAdmin } from "@/lib/supabase/admin"
import { withCache, CK } from "@/lib/redis"

export async function buildMiniContext(founderId: string): Promise<string> {
  return withCache(CK.miniContext(founderId), 30, () => _build(founderId))
}

async function _build(founderId: string): Promise<string> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd   = new Date(todayStart.getTime() + 86400000 - 1)
  const weekEnd    = new Date(now.getTime() + 7 * 86400000)

  const [profileRes, tasksRes, projectsRes, teamRes, dealsRes, eventsRes] =
    await Promise.all([
      supabaseAdmin.from("profiles").select("full_name").eq("id", founderId).single(),

      supabaseAdmin
        .from("tasks")
        .select("id, status, due_date")
        .eq("user_id", founderId)
        .eq("is_completed", false),

      supabaseAdmin
        .from("projects")
        .select("id, status")
        .eq("founder_id", founderId),

      supabaseAdmin
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("founder_id", founderId)
        .eq("is_active", true),

      supabaseAdmin
        .from("relationships")
        .select("id, deal_value, pipeline_stage")
        .eq("user_id", founderId)
        .eq("status", "active"),

      supabaseAdmin
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", founderId)
        .gte("start_time", now.toISOString())
        .lte("start_time", weekEnd.toISOString()),
    ])

  const profile  = profileRes.data
  const tasks    = tasksRes.data || []
  const projects = projectsRes.data || []
  const deals    = dealsRes.data || []

  const overdueCount  = tasks.filter(t => t.due_date && new Date(t.due_date) < now).length
  const blockedCount  = tasks.filter(t => t.status === "blocked").length
  const todayCount    = tasks.filter(t => {
    if (!t.due_date) return false
    const d = new Date(t.due_date)
    return d >= todayStart && d <= todayEnd
  }).length

  const activeDeals = deals.filter(d => !["closed_won","closed_lost"].includes(d.pipeline_stage))
  const pipelineValue = activeDeals.reduce((s, d) => s + (d.deal_value || 0), 0)
  const activeProjects = projects.filter(p => p.status === "active").length

  const parts: string[] = [
    `Founder: ${profile?.full_name || "Unknown"} | ${now.toLocaleDateString("en-US",
      { weekday:"long", month:"long", day:"numeric", year:"numeric" })} ${
      now.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" })}`,

    [
      `Tasks: ${tasks.length} active`,
      overdueCount ? `${overdueCount} overdue` : null,
      blockedCount ? `${blockedCount} blocked` : null,
      todayCount   ? `${todayCount} due today` : null,
    ].filter(Boolean).join(", "),

    `Projects: ${activeProjects} active / ${projects.length} total`,
    `Team: ${teamRes.count || 0} members`,
    `CRM: ${activeDeals.length} active deals${pipelineValue ? ` | $${pipelineValue.toLocaleString()} pipeline` : ""}`,
    `Calendar: ${eventsRes.count || 0} events this week`,
  ]

  return parts.join("\n")
}