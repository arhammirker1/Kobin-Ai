// ── Mini Context Builder ────────────────────────────────────────────────────
// Returns a tiny workspace summary (~100 tokens) instead of dumping everything.
// The AI uses read tools to fetch details on demand.

import { supabaseAdmin } from "@/lib/supabase/admin"

export async function buildMiniContext(founderId: string): Promise<string> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1)
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [profileRes, tasksRes, projectsRes, teamCountRes, dealsRes, eventsCountRes] =
    await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", founderId)
        .single(),

      // Minimal fields — just enough for counts
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

  const profile = profileRes.data
  const tasks = tasksRes.data || []
  const projects = projectsRes.data || []
  const deals = dealsRes.data || []

  const overdueCount = tasks.filter(
    (t) => t.due_date && new Date(t.due_date) < now
  ).length
  const blockedCount = tasks.filter((t) => t.status === "blocked").length
  const todayCount = tasks.filter((t) => {
    if (!t.due_date) return false
    const d = new Date(t.due_date)
    return d >= todayStart && d <= todayEnd
  }).length

  const activeProjects = projects.filter((p) => p.status === "active").length
  const activeDeals = deals.filter(
    (d) => !["closed_won", "closed_lost"].includes(d.pipeline_stage)
  )
  const pipelineValue = activeDeals.reduce(
    (s, d) => s + (d.deal_value || 0),
    0
  )

  const teamCount = teamCountRes.count || 0
  const eventsCount = eventsCountRes.count || 0

  const parts: string[] = []
  parts.push(
    `Founder: ${profile?.full_name || "Unknown"} | ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
  )

  // Task line
  let taskLine = `Tasks: ${tasks.length} active`
  if (overdueCount) taskLine += `, ${overdueCount} overdue`
  if (blockedCount) taskLine += `, ${blockedCount} blocked`
  if (todayCount) taskLine += `, ${todayCount} due today`
  parts.push(taskLine)

  parts.push(`Projects: ${activeProjects} active / ${projects.length} total`)
  parts.push(`Team: ${teamCount} members`)

  let crmLine = `CRM: ${activeDeals.length} active deals`
  if (pipelineValue) crmLine += ` | $${pipelineValue.toLocaleString()} pipeline`
  parts.push(crmLine)

  parts.push(`Calendar: ${eventsCount} events this week`)

  return parts.join("\n")
}
