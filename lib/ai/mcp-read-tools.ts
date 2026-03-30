// ── MCP-Style Read Tools ────────────────────────────────────────────────────
// Instead of dumping everything into context, the AI calls these tools
// to fetch exactly what it needs, when it needs it.

import { supabaseAdmin } from "@/lib/supabase/admin"
import type { TeamMemberContext, ProjectContext } from "./action-executor"

// ── Types ───────────────────────────────────────────────────────────────────

export interface ReadToolResult {
  content: string
  teamData?: TeamMemberContext[]
  projectData?: ProjectContext[]
}

// ── Tool Schemas (for LLM) ──────────────────────────────────────────────────

export const READ_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_workspace_overview",
      description:
        "Get detailed workspace stats — task breakdowns, project list, pipeline summary, upcoming event count. Call this for broad situational awareness.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_tasks",
      description:
        "Fetch tasks with optional filters. Returns compact task list with status, priority, due date, assignee, project.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: [
              "all_active",
              "overdue",
              "blocked",
              "due_today",
              "due_this_week",
              "completed_recent",
            ],
            description: "Quick filter preset. Default: all_active",
          },
          project_name: {
            type: "string",
            description: "Filter tasks by project name (fuzzy match)",
          },
          assigned_to_name: {
            type: "string",
            description: "Filter tasks by assignee name (fuzzy match)",
          },
          limit: {
            type: "number",
            description: "Max results (default 20, max 30)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_projects",
      description:
        "Fetch projects with task counts. Returns project list with status, priority, task stats.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["active", "on-hold", "completed", "cancelled", "all"],
            description: "Filter by status. Default: all",
          },
          name: {
            type: "string",
            description: "Search by project name (fuzzy match)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_team_workload",
      description:
        "Get all team members with their active task counts and workload level (FREE/LIGHT/MODERATE/HEAVY). Use before assigning tasks.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_crm_pipeline",
      description:
        "Fetch CRM deals grouped by pipeline stage, with values and contact info. Optionally include clients.",
      parameters: {
        type: "object",
        properties: {
          stage: {
            type: "string",
            description:
              "Filter by stage: new_lead, contacted, meeting_booked, proposal, negotiating, closed_won, closed_lost",
          },
          include_clients: {
            type: "boolean",
            description: "Also return client list. Default: false",
          },
          stale_only: {
            type: "boolean",
            description: "Only show deals stale 14+ days. Default: false",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_calendar",
      description: "Fetch upcoming or recent calendar events.",
      parameters: {
        type: "object",
        properties: {
          range: {
            type: "string",
            enum: [
              "today",
              "this_week",
              "next_7_days",
              "next_14_days",
              "past_7_days",
              "past_30_days",
            ],
            description: "Time range. Default: next_7_days",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_vault_files",
      description:
        "Fetch vault files/documents. Filter by project to see what can be attached to tasks.",
      parameters: {
        type: "object",
        properties: {
          project_name: {
            type: "string",
            description: "Filter by project name (fuzzy match)",
          },
          search: {
            type: "string",
            description: "Search file titles",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_contacts",
      description:
        "Look up a specific contact/lead/investor by name. Returns full profile, pipeline stage, deal details, upcoming meetings, and recent email threads. Use this when the user asks about a specific person.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Contact name to search for (fuzzy match)",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_follow_up_needed",
      description:
        "Scan workspace for items needing follow-up: overdue tasks, stale CRM deals (14+ days in stage), contacts who are ghosting, and upcoming meetings needing prep. Returns a prioritized action list.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
] as const

export type ReadToolName =
  | "get_workspace_overview"
  | "get_tasks"
  | "get_projects"
  | "get_team_workload"
  | "get_crm_pipeline"
  | "get_calendar"
  | "get_vault_files"
  | "search_contacts"
  | "get_follow_up_needed"

// ── Helpers ─────────────────────────────────────────────────────────────────

const PRI = { low: "L", medium: "M", high: "H", urgent: "U" } as Record<string, string>
const STAT = { todo: "td", "in-progress": "ip", blocked: "bl", completed: "dn" } as Record<string, string>

function shortDate(d: string | null) {
  if (!d) return ""
  return new Date(d).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
}

// ── Main Router ─────────────────────────────────────────────────────────────

export async function executeReadTool(
  toolName: ReadToolName,
  args: Record<string, any>,
  founderId: string
): Promise<ReadToolResult> {
  switch (toolName) {
    case "get_workspace_overview":
      return execOverview(founderId)
    case "get_tasks":
      return execGetTasks(args, founderId)
    case "get_projects":
      return execGetProjects(args, founderId)
    case "get_team_workload":
      return execTeamWorkload(founderId)
    case "get_crm_pipeline":
      return execCRM(args, founderId)
    case "get_calendar":
      return execCalendar(args, founderId)
    case "get_vault_files":
      return execVault(args, founderId)
    case "search_contacts":
      return execSearchContacts(args, founderId)
    case "get_follow_up_needed":
      return execFollowUpNeeded(founderId)
    default:
      return { content: `Unknown read tool: ${toolName}` }
  }
}

// ── Executors ───────────────────────────────────────────────────────────────

async function execOverview(founderId: string): Promise<ReadToolResult> {
  const now = new Date()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

  const [tasksRes, projectsRes, teamRes, dealsRes, eventsRes] = await Promise.all([
    supabaseAdmin
      .from("tasks")
      .select("id, status, priority, due_date, is_completed")
      .eq("user_id", founderId)
      .eq("is_completed", false),
    supabaseAdmin
      .from("projects")
      .select("id, name, status, priority")
      .eq("founder_id", founderId),
    supabaseAdmin
      .from("team_members")
      .select("id")
      .eq("founder_id", founderId)
      .eq("is_active", true),
    supabaseAdmin
      .from("relationships")
      .select("id, deal_value, pipeline_stage, stage_entered_at, close_probability")
      .eq("user_id", founderId)
      .eq("status", "active"),
    supabaseAdmin
      .from("events")
      .select("id")
      .eq("user_id", founderId)
      .gte("start_time", now.toISOString())
      .lte("start_time", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  const tasks = tasksRes.data || []
  const projects = projectsRes.data || []
  const deals = dealsRes.data || []
  const activeDeals = deals.filter((d) => !["closed_won", "closed_lost"].includes(d.pipeline_stage))
  const staleDeals = activeDeals.filter(
    (d) => d.stage_entered_at && new Date(d.stage_entered_at) < fourteenDaysAgo
  )
  const pipelineValue = activeDeals.reduce((s, d) => s + (d.deal_value || 0), 0)
  const weighted = activeDeals.reduce((s, d) => {
    if (!d.deal_value || d.close_probability == null) return s
    return s + (d.deal_value * d.close_probability) / 100
  }, 0)

  const overdue = tasks.filter((t) => t.due_date && new Date(t.due_date) < now).length
  const blocked = tasks.filter((t) => t.status === "blocked").length
  const today = tasks.filter((t) => t.due_date && new Date(t.due_date) <= todayEnd).length
  const byPriority = { urgent: 0, high: 0, medium: 0, low: 0 } as Record<string, number>
  tasks.forEach((t) => { if (t.priority && byPriority[t.priority] !== undefined) byPriority[t.priority]++ })

  const lines: string[] = []
  lines.push(`## Task Overview`)
  lines.push(
    `Active: ${tasks.length} | Overdue: ${overdue} | Blocked: ${blocked} | Due today: ${today}`
  )
  lines.push(
    `By priority — U:${byPriority.urgent} H:${byPriority.high} M:${byPriority.medium} L:${byPriority.low}`
  )

  lines.push(`\n## Projects (${projects.length})`)
  const byStatus: Record<string, typeof projects> = {}
  projects.forEach((p) => {
    const s = p.status || "unknown"
    if (!byStatus[s]) byStatus[s] = []
    byStatus[s].push(p)
  })
  for (const [status, prjs] of Object.entries(byStatus)) {
    lines.push(
      `${status.toUpperCase()}: ${prjs.map((p) => `${p.name} (${p.priority})`).join(", ")}`
    )
  }

  lines.push(`\n## Team: ${teamRes.data?.length || 0} active members`)

  lines.push(`\n## CRM Pipeline`)
  lines.push(
    `Active deals: ${activeDeals.length} | $${pipelineValue.toLocaleString()} total | $${Math.round(weighted).toLocaleString()} weighted | ${staleDeals.length} stale`
  )

  lines.push(`\n## Calendar: ${eventsRes.data?.length || 0} events this week`)

  return { content: lines.join("\n") }
}

async function execGetTasks(
  args: Record<string, any>,
  founderId: string
): Promise<ReadToolResult> {
  const { filter = "all_active", project_name, assigned_to_name, limit = 20 } = args
  const now = new Date()
  const cap = Math.min(limit, 30)

  // Resolve project filter
  let projectId: string | null = null
  if (project_name) {
    const { data } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("founder_id", founderId)
      .ilike("name", `%${project_name}%`)
      .limit(1)
    if (data?.[0]) projectId = data[0].id
    else return { content: `No project found matching "${project_name}".` }
  }

  // Resolve assignee filter
  let assigneeId: string | null = null
  if (assigned_to_name) {
    const { data: members } = await supabaseAdmin
      .from("team_members")
      .select("user_id, profile:profiles!team_members_user_id_profiles_fkey(full_name)")
      .eq("founder_id", founderId)
      .eq("is_active", true)
    if (members) {
      const match = members.find((m: any) =>
        (m.profile?.full_name || "").toLowerCase().includes(assigned_to_name.toLowerCase())
      )
      if (match) assigneeId = match.user_id
      else return { content: `No team member found matching "${assigned_to_name}".` }
    }
  }

  // Build query
  let query = supabaseAdmin
    .from("tasks")
    .select("id, title, status, priority, due_date, assigned_to, project_id, notes")
    .eq("user_id", founderId)
    .order("created_at", { ascending: false })
    .limit(cap)

  if (filter === "overdue") {
    query = query
      .eq("is_completed", false)
      .not("due_date", "is", null)
      .lt("due_date", now.toISOString())
  } else if (filter === "blocked") {
    query = query.eq("is_completed", false).eq("status", "blocked")
  } else if (filter === "due_today") {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    query = query
      .eq("is_completed", false)
      .not("due_date", "is", null)
      .lte("due_date", end.toISOString())
      .gte("due_date", new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString())
  } else if (filter === "due_this_week") {
    const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    query = query
      .eq("is_completed", false)
      .not("due_date", "is", null)
      .lte("due_date", weekEnd.toISOString())
  } else if (filter === "completed_recent") {
    query = query.eq("is_completed", true).limit(15)
  } else {
    query = query.eq("is_completed", false)
  }

  if (projectId) query = query.eq("project_id", projectId)
  if (assigneeId) query = query.eq("assigned_to", assigneeId)

  const { data: tasks, error } = await query
  if (error) return { content: `Error: ${error.message}` }
  if (!tasks || tasks.length === 0) return { content: "No tasks found matching criteria." }

  // Resolve names for display
  const pIds = [...new Set(tasks.map((t) => t.project_id).filter(Boolean))] as string[]
  const aIds = [...new Set(tasks.map((t) => t.assigned_to).filter(Boolean))] as string[]
  let pMap: Record<string, string> = {}
  let aMap: Record<string, string> = {}

  const lookups: Promise<void>[] = []
  if (pIds.length > 0) {
    lookups.push(
      (async () => {
        const { data } = await supabaseAdmin.from("projects").select("id, name").in("id", pIds)
        if (data) pMap = Object.fromEntries(data.map((p) => [p.id, p.name]))
      })()
    )
  }
  if (aIds.length > 0) {
    lookups.push(
      (async () => {
        const { data } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", aIds)
        if (data) aMap = Object.fromEntries(data.map((p) => [p.id, p.full_name]))
      })()
    )
  }
  await Promise.all(lookups)

  const lines = [`${tasks.length} task${tasks.length > 1 ? "s" : ""} found:`]
  for (const t of tasks) {
    const od = t.due_date && new Date(t.due_date) < now && !t.status?.includes("completed") ? " [OD]" : ""
    let line = `- [${PRI[t.priority] || "M"}] ${t.title} | ${STAT[t.status] || t.status}`
    if (t.due_date) line += ` | ${shortDate(t.due_date)}${od}`
    if (t.assigned_to && aMap[t.assigned_to]) line += ` | →${aMap[t.assigned_to]}`
    if (t.project_id && pMap[t.project_id]) line += ` | →${pMap[t.project_id]}`
    lines.push(line)
  }

  return { content: lines.join("\n") }
}

async function execGetProjects(
  args: Record<string, any>,
  founderId: string
): Promise<ReadToolResult> {
  const { status = "all", name } = args

  let query = supabaseAdmin
    .from("projects")
    .select("id, name, description, status, priority, start_date, end_date")
    .eq("founder_id", founderId)
    .order("updated_at", { ascending: false })

  if (status && status !== "all") query = query.eq("status", status)
  if (name) query = query.ilike("name", `%${name}%`)

  const { data: projects, error } = await query
  if (error) return { content: `Error: ${error.message}`, projectData: [] }
  if (!projects || projects.length === 0) return { content: "No projects found.", projectData: [] }

  // Get task counts per project
  const pIds = projects.map((p) => p.id)
  const { data: allTasks } = await supabaseAdmin
    .from("tasks")
    .select("id, project_id, is_completed, due_date, status")
    .eq("user_id", founderId)
    .in("project_id", pIds)

  const tasksByProject: Record<string, { active: number; done: number; overdue: number }> = {}
  const now = new Date()
  for (const t of allTasks || []) {
    if (!t.project_id) continue
    if (!tasksByProject[t.project_id]) tasksByProject[t.project_id] = { active: 0, done: 0, overdue: 0 }
    if (t.is_completed) tasksByProject[t.project_id].done++
    else {
      tasksByProject[t.project_id].active++
      if (t.due_date && new Date(t.due_date) < now) tasksByProject[t.project_id].overdue++
    }
  }

  const lines = [`${projects.length} project${projects.length > 1 ? "s" : ""}:`]
  for (const p of projects) {
    const tc = tasksByProject[p.id] || { active: 0, done: 0, overdue: 0 }
    const deadline = p.end_date ? ` | deadline ${shortDate(p.end_date)}` : ""
    lines.push(
      `- [${p.status.toUpperCase()}] ${p.name} | ${p.priority} | ${tc.active} active, ${tc.done} done${tc.overdue ? `, ${tc.overdue} overdue` : ""}${deadline}`
    )
    if (p.description) lines.push(`  ${p.description.slice(0, 80)}`)
  }

  const projectData: ProjectContext[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
  }))

  return { content: lines.join("\n"), projectData }
}

async function execTeamWorkload(founderId: string): Promise<ReadToolResult> {
  const { data: members } = await supabaseAdmin
    .from("team_members")
    .select(
      "user_id, position, is_active, profile:profiles!team_members_user_id_profiles_fkey(full_name, email)"
    )
    .eq("founder_id", founderId)
    .eq("is_active", true)

  if (!members || members.length === 0) return { content: "No active team members.", teamData: [] }

  // Count active tasks per member
  const { data: tasks } = await supabaseAdmin
    .from("tasks")
    .select("assigned_to")
    .eq("user_id", founderId)
    .eq("is_completed", false)

  const counts: Record<string, number> = {}
  for (const t of tasks || []) {
    if (t.assigned_to) counts[t.assigned_to] = (counts[t.assigned_to] || 0) + 1
  }

  const teamData: TeamMemberContext[] = members.map((m: any) => ({
    user_id: m.user_id,
    full_name: m.profile?.full_name || "Unknown",
    position: m.position || "",
    active_task_count: counts[m.user_id] || 0,
  }))

  const sorted = [...teamData].sort((a, b) => a.active_task_count - b.active_task_count)

  const lines = [`Team (${sorted.length} members):`]
  for (const m of sorted) {
    const load =
      m.active_task_count === 0
        ? "FREE"
        : m.active_task_count <= 3
          ? "LIGHT"
          : m.active_task_count <= 6
            ? "MODERATE"
            : "HEAVY"
    lines.push(
      `- ${m.full_name} | ${m.position} | ${m.active_task_count} tasks [${load}]`
    )
  }

  return { content: lines.join("\n"), teamData }
}

async function execCRM(
  args: Record<string, any>,
  founderId: string
): Promise<ReadToolResult> {
  const { stage } = args
  const include_clients = args.include_clients === true || args.include_clients === "true"
  const stale_only = args.stale_only === true || args.stale_only === "true"
  const now = new Date()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

  let query = supabaseAdmin
    .from("relationships")
    .select(
      "id, full_name, company, role, relationship_type, pipeline_stage, deal_value, close_probability, stage_entered_at, expected_close_date, pipeline_notes, status"
    )
    .eq("user_id", founderId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(30)

  if (stage) query = query.eq("pipeline_stage", stage)

  const { data: relationships, error } = await query
  if (error) return { content: `Error: ${error.message}` }

  let deals = relationships || []
  if (stale_only) {
    deals = deals.filter(
      (d) =>
        d.stage_entered_at &&
        new Date(d.stage_entered_at) < fourteenDaysAgo &&
        !["closed_won", "closed_lost"].includes(d.pipeline_stage)
    )
  }

  const activeDeals = deals.filter(
    (d) => !["closed_won", "closed_lost"].includes(d.pipeline_stage)
  )
  const totalValue = activeDeals.reduce((s, d) => s + (d.deal_value || 0), 0)
  const weighted = activeDeals.reduce((s, d) => {
    if (!d.deal_value || d.close_probability == null) return s
    return s + (d.deal_value * d.close_probability) / 100
  }, 0)

  const lines: string[] = []
  lines.push(
    `Pipeline: $${totalValue.toLocaleString()} total | $${Math.round(weighted).toLocaleString()} weighted | ${activeDeals.length} active deals`
  )

  // Group by stage
  const stageOrder = [
    "new_lead",
    "contacted",
    "meeting_booked",
    "proposal",
    "negotiating",
    "closed_won",
    "closed_lost",
  ]
  for (const s of stageOrder) {
    const inStage = deals.filter((d) => d.pipeline_stage === s)
    if (inStage.length === 0) continue
    lines.push(`\n${s.replace(/_/g, " ").toUpperCase()} (${inStage.length}):`)
    for (const d of inStage) {
      const days = d.stage_entered_at
        ? Math.floor(
            (now.getTime() - new Date(d.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24)
          )
        : 0
      const val = d.deal_value ? ` | $${d.deal_value.toLocaleString()}` : ""
      const prob = d.close_probability != null ? ` @ ${d.close_probability}%` : ""
      const stale =
        days > 14 && !["closed_won", "closed_lost"].includes(s) ? " [STALE]" : ""
      lines.push(`- ${d.full_name}${d.company ? ` (${d.company})` : ""} | ${days}d${val}${prob}${stale}`)
    }
  }

  // Optional clients
  if (include_clients) {
    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id, name, company, status, project_id, notes")
      .eq("founder_id", founderId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(15)

    if (clients && clients.length > 0) {
      lines.push(`\nClients (${clients.length}):`)
      for (const c of clients) {
        lines.push(`- ${c.name}${c.company ? ` (${c.company})` : ""} | ${c.status}`)
      }
    }
  }

  return { content: lines.join("\n") }
}

async function execCalendar(
  args: Record<string, any>,
  founderId: string
): Promise<ReadToolResult> {
  const { range = "next_7_days" } = args
  const now = new Date()

  let gte: string
  let lte: string
  let ascending = true
  let label = ""

  switch (range) {
    case "today": {
      gte = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      lte = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
      label = "Today's events"
      break
    }
    case "this_week": {
      const dayOfWeek = now.getDay()
      const weekStart = new Date(now.getTime() - dayOfWeek * 24 * 60 * 60 * 1000)
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
      gte = weekStart.toISOString()
      lte = weekEnd.toISOString()
      label = "This week"
      break
    }
    case "next_14_days":
      gte = now.toISOString()
      lte = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      label = "Next 14 days"
      break
    case "past_7_days":
      gte = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      lte = now.toISOString()
      ascending = false
      label = "Past 7 days"
      break
    case "past_30_days":
      gte = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      lte = now.toISOString()
      ascending = false
      label = "Past 30 days"
      break
    default:
      gte = now.toISOString()
      lte = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      label = "Next 7 days"
  }

  const { data: events, error } = await supabaseAdmin
    .from("events")
    .select("id, title, start_time, end_time, type, purpose, meeting_link, outcome")
    .eq("user_id", founderId)
    .gte("start_time", gte)
    .lte("start_time", lte)
    .order("start_time", { ascending })
    .limit(15)

  if (error) return { content: `Error: ${error.message}` }
  if (!events || events.length === 0)
    return { content: `No events found (${label}).` }

  const lines = [`${label} (${events.length}):`]
  for (const e of events) {
    const date = new Date(e.start_time).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    let line = `- ${date} | ${e.title} | ${e.type}`
    if (e.purpose) line += ` | ${e.purpose}`
    if (e.meeting_link) line += ` | has link`
    if (e.outcome) line += ` | outcome: ${e.outcome.slice(0, 60)}`
    lines.push(line)
  }

  return { content: lines.join("\n") }
}

async function execVault(
  args: Record<string, any>,
  founderId: string
): Promise<ReadToolResult> {
  const { project_name, search } = args

  // Resolve project
  let projectId: string | null = null
  let projectLabel = "All projects"
  if (project_name) {
    const { data } = await supabaseAdmin
      .from("projects")
      .select("id, name")
      .eq("founder_id", founderId)
      .ilike("name", `%${project_name}%`)
      .limit(1)
    if (data?.[0]) {
      projectId = data[0].id
      projectLabel = data[0].name
    } else {
      return { content: `No project found matching "${project_name}".` }
    }
  }

  let query = supabaseAdmin
    .from("vault_items")
    .select("id, title, description, document_type, item_type, project_id")
    .eq("founder_id", founderId)
    .order("created_at", { ascending: false })
    .limit(20)

  if (projectId) query = query.eq("project_id", projectId)
  if (search) query = query.ilike("title", `%${search}%`)

  const { data: items, error } = await query
  if (error) return { content: `Error: ${error.message}` }
  if (!items || items.length === 0) return { content: `No vault files found.` }

  // Resolve project names for items without a filter
  let pMap: Record<string, string> = {}
  if (!projectId) {
    const pIds = [...new Set(items.map((i) => i.project_id).filter(Boolean))] as string[]
    if (pIds.length > 0) {
      const { data } = await supabaseAdmin
        .from("projects")
        .select("id, name")
        .in("id", pIds)
      if (data) pMap = Object.fromEntries(data.map((p) => [p.id, p.name]))
    }
  }

  const lines = [`Vault — ${projectLabel} (${items.length} files):`]
  for (const v of items) {
    let line = `- "${v.title}" | ${v.document_type} | ${v.item_type}`
    if (v.description) line += ` | ${v.description.slice(0, 50)}`
    if (!projectId && v.project_id && pMap[v.project_id]) line += ` | →${pMap[v.project_id]}`
    lines.push(line)
  }

  return { content: lines.join("\n") }
}

async function execSearchContacts(
  args: Record<string, any>,
  founderId: string
): Promise<ReadToolResult> {
  const { name } = args
  if (!name) return { content: "No name provided to search." }

  // Fuzzy search contacts by name — include lead scoring + ghosting columns
  const { data: contacts, error } = await supabaseAdmin
    .from("relationships")
    .select(
      "id, full_name, email, company, role, relationship_type, pipeline_stage, deal_value, close_probability, stage_entered_at, expected_close_date, pipeline_notes, linkedin_profile_url, tags, status, created_at, updated_at, lead_score, lead_status, is_ghosting, ghosting_days, last_inbound_at, last_outbound_at"
    )
    .eq("user_id", founderId)
    .ilike("full_name", `%${name}%`)
    .limit(5)

  if (error) return { content: `Error: ${error.message}` }
  if (!contacts || contacts.length === 0) {
    return { content: `No contact found matching "${name}".` }
  }

  const now = new Date()
  const lines: string[] = []

  for (const c of contacts) {
    // ── Contact profile ───────────────────────────────────────────────
    lines.push(`## ${c.full_name}`)
    const details: string[] = []
    if (c.email) details.push(`Email: ${c.email}`)
    if (c.company) details.push(`Company: ${c.company}`)
    if (c.role) details.push(`Role: ${c.role}`)
    details.push(`Type: ${c.relationship_type}`)
    details.push(`Status: ${c.status}`)
    if (c.linkedin_profile_url) details.push(`LinkedIn: ${c.linkedin_profile_url}`)
    lines.push(details.join(" | "))

    // ── Pipeline info ─────────────────────────────────────────────────
    const stageName = c.pipeline_stage.replace(/_/g, " ")
    const daysInStage = c.stage_entered_at
      ? Math.floor((now.getTime() - new Date(c.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0
    lines.push(`Pipeline: ${stageName.toUpperCase()} (${daysInStage} days in stage)`)

    if (c.deal_value) {
      const weighted = c.close_probability != null
        ? ` | Weighted: $${Math.round((c.deal_value * c.close_probability) / 100).toLocaleString()}`
        : ""
      lines.push(
        `Deal: $${c.deal_value.toLocaleString()} | ${c.close_probability ?? 0}% probability${weighted}`
      )
    } else {
      lines.push("Deal: No value set")
    }

    if (c.expected_close_date) lines.push(`Expected close: ${c.expected_close_date}`)
    if (c.pipeline_notes) lines.push(`Notes: ${c.pipeline_notes}`)
    if (c.tags && c.tags.length > 0) lines.push(`Tags: ${c.tags.join(", ")}`)
    lines.push(`Added: ${shortDate(c.created_at)} | Last updated: ${shortDate(c.updated_at)}`)

    // ── Lead Score & Ghosting ─────────────────────────────────────────
    const scoreLabel = (c.lead_status || "cold").toUpperCase()
    lines.push(`\nLead score: ${c.lead_score || 0}/100 (${scoreLabel})`)
    if (c.is_ghosting) {
      lines.push(`⚠ GHOSTING: No reply for ${c.ghosting_days || 0} days`)
    }
    if (c.last_inbound_at) {
      const lastIn = new Date(c.last_inbound_at)
      const daysAgo = Math.floor((now.getTime() - lastIn.getTime()) / (1000 * 60 * 60 * 24))
      lines.push(`Last inbound email: ${shortDate(c.last_inbound_at)} (${daysAgo}d ago)`)
    }
    if (c.last_outbound_at) {
      lines.push(`Last outbound email: ${shortDate(c.last_outbound_at)}`)
    }

    // ── Upcoming & recent meetings ────────────────────────────────────
    const [upcomingRes, pastRes] = await Promise.all([
      supabaseAdmin
        .from("events")
        .select("title, start_time, end_time, purpose, meeting_link")
        .eq("user_id", founderId)
        .eq("relationship_id", c.id)
        .gte("start_time", now.toISOString())
        .order("start_time", { ascending: true })
        .limit(3),
      supabaseAdmin
        .from("events")
        .select("title, start_time, purpose, outcome")
        .eq("user_id", founderId)
        .eq("relationship_id", c.id)
        .lt("start_time", now.toISOString())
        .order("start_time", { ascending: false })
        .limit(5),
    ])

    if (upcomingRes.data && upcomingRes.data.length > 0) {
      lines.push(`\nUpcoming meetings (${upcomingRes.data.length}):`)
      for (const e of upcomingRes.data) {
        const date = new Date(e.start_time).toLocaleString("en-US", {
          weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        })
        let line = `- ${date}: ${e.title}`
        if (e.purpose) line += ` — ${e.purpose}`
        if (e.meeting_link) line += ` [has link]`
        lines.push(line)
      }
    } else {
      lines.push("\nNo upcoming meetings scheduled")
    }

    if (pastRes.data && pastRes.data.length > 0) {
      lines.push(`\nRecent past meetings (${pastRes.data.length}):`)
      for (const e of pastRes.data) {
        const date = new Date(e.start_time).toLocaleString("en-US", {
          month: "short", day: "numeric",
        })
        let line = `- ${date}: ${e.title}`
        if (e.outcome) line += ` → Outcome: ${e.outcome.slice(0, 100)}`
        else if (e.purpose) line += ` — ${e.purpose}`
        lines.push(line)
      }
    }

    // ── Email conversation history (from email_analyses) ──────────────
    const { data: emailAnalyses } = await supabaseAdmin
      .from("email_analyses")
      .select(
        "gmail_thread_id, gmail_message_id, intent, intent_confidence, sentiment, signals, direction, analyzed_at, thread_subject"
      )
      .eq("user_id", founderId)
      .eq("contact_id", c.id)
      .not("gmail_message_id", "like", "__thread_meta_%")
      .order("analyzed_at", { ascending: false })
      .limit(30)

    if (emailAnalyses && emailAnalyses.length > 0) {
      // Group by thread
      const threadMap: Record<string, {
        subject: string | null
        messages: typeof emailAnalyses
        lastDate: string
      }> = {}

      for (const a of emailAnalyses) {
        const tid = a.gmail_thread_id
        if (!threadMap[tid]) {
          threadMap[tid] = {
            subject: a.thread_subject || null,
            messages: [],
            lastDate: a.analyzed_at,
          }
        }
        threadMap[tid].messages.push(a)
        // Keep the subject from whichever row has it
        if (a.thread_subject && !threadMap[tid].subject) {
          threadMap[tid].subject = a.thread_subject
        }
      }

      const threadEntries = Object.entries(threadMap)
        .sort(([, a], [, b]) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime())

      lines.push(`\nEmail conversations (${threadEntries.length} threads, ${emailAnalyses.length} analyzed messages):`)

      for (const [, thread] of threadEntries.slice(0, 5)) {
        const inbound = thread.messages.filter((m) => m.direction === "inbound")
        const outbound = thread.messages.filter((m) => m.direction === "outbound")
        const totalMsgs = thread.messages.length

        // Determine dominant intent from inbound messages
        let dominantIntent = "neutral"
        let highestConf = 0
        for (const m of inbound) {
          if (m.intent !== "neutral" && m.intent_confidence > highestConf) {
            dominantIntent = m.intent
            highestConf = m.intent_confidence
          }
        }

        // Overall sentiment from inbound
        const sentimentCounts: Record<string, number> = { positive: 0, neutral: 0, negative: 0 }
        for (const m of inbound) {
          sentimentCounts[m.sentiment] = (sentimentCounts[m.sentiment] || 0) + 1
        }
        const overallSentiment = Object.entries(sentimentCounts)
          .sort(([, a], [, b]) => b - a)[0]?.[0] || "neutral"

        // Collect all signals
        const allSignals = [...new Set(inbound.flatMap((m) => m.signals || []))]

        // Days since last activity
        const lastActivity = new Date(thread.lastDate)
        const daysAgo = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
        const dateLabel = shortDate(thread.lastDate)

        const subjectLabel = thread.subject
          ? `"${thread.subject}"`
          : "(no subject)"

        lines.push(
          `- ${subjectLabel} | ${totalMsgs} msgs (${inbound.length}↓ ${outbound.length}↑) | Last: ${dateLabel} (${daysAgo}d ago) | Intent: ${dominantIntent.replace(/_/g, " ")} | Sentiment: ${overallSentiment}`
        )
        if (allSignals.length > 0) {
          lines.push(`  Signals: ${allSignals.slice(0, 4).join(", ")}`)
        }
      }
    } else {
      lines.push("\nNo analyzed email conversations")
    }

    lines.push("") // spacer between contacts
  }

  return { content: lines.join("\n") }
}

// ── Follow-up Scanner ───────────────────────────────────────────────────────

async function execFollowUpNeeded(founderId: string): Promise<ReadToolResult> {
  const now = new Date()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59)

  const [overdueRes, staleDealsRes, ghostingRes, upcomingMeetingsRes] = await Promise.all([
    // Overdue tasks
    supabaseAdmin
      .from("tasks")
      .select("id, title, priority, due_date, assigned_to, project_id")
      .eq("user_id", founderId)
      .eq("is_completed", false)
      .not("due_date", "is", null)
      .lt("due_date", now.toISOString())
      .order("due_date", { ascending: true })
      .limit(15),

    // Stale CRM deals (14+ days in current stage)
    supabaseAdmin
      .from("relationships")
      .select("id, full_name, company, pipeline_stage, deal_value, stage_entered_at, lead_score")
      .eq("user_id", founderId)
      .eq("status", "active")
      .not("pipeline_stage", "in", '("closed_won","closed_lost")')
      .not("stage_entered_at", "is", null)
      .lt("stage_entered_at", fourteenDaysAgo.toISOString())
      .order("deal_value", { ascending: false })
      .limit(10),

    // Ghosting contacts
    supabaseAdmin
      .from("relationships")
      .select("id, full_name, company, email, ghosting_days, last_outbound_at, pipeline_stage, deal_value")
      .eq("user_id", founderId)
      .eq("status", "active")
      .eq("is_ghosting", true)
      .order("ghosting_days", { ascending: false })
      .limit(10),

    // Upcoming meetings (next 24h) — may need prep
    supabaseAdmin
      .from("events")
      .select("id, title, start_time, purpose, relationship_id")
      .eq("user_id", founderId)
      .gte("start_time", now.toISOString())
      .lte("start_time", tomorrowEnd.toISOString())
      .order("start_time", { ascending: true })
      .limit(5),
  ])

  const lines: string[] = ["## Follow-Up Needed"]
  let totalItems = 0

  // Overdue tasks
  const overdue = overdueRes.data || []
  if (overdue.length > 0) {
    totalItems += overdue.length
    lines.push(`\n### 🔴 Overdue Tasks (${overdue.length})`)
    for (const t of overdue) {
      const daysOverdue = Math.floor((now.getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24))
      lines.push(`- [${t.priority?.charAt(0).toUpperCase() || 'M'}] ${t.title} — ${daysOverdue}d overdue`)
    }
  }

  // Stale deals
  const staleDeals = staleDealsRes.data || []
  if (staleDeals.length > 0) {
    totalItems += staleDeals.length
    lines.push(`\n### 🟡 Stale Deals (${staleDeals.length})`)
    for (const d of staleDeals) {
      const days = Math.floor((now.getTime() - new Date(d.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24))
      const val = d.deal_value ? ` | $${d.deal_value.toLocaleString()}` : ""
      lines.push(`- ${d.full_name}${d.company ? ` (${d.company})` : ""} — ${d.pipeline_stage.replace(/_/g, " ")} for ${days}d${val}`)
    }
  }

  // Ghosting contacts
  const ghosting = ghostingRes.data || []
  if (ghosting.length > 0) {
    totalItems += ghosting.length
    lines.push(`\n### 👻 Ghosting Contacts (${ghosting.length})`)
    for (const g of ghosting) {
      const val = g.deal_value ? ` | $${g.deal_value.toLocaleString()}` : ""
      lines.push(`- ${g.full_name}${g.company ? ` (${g.company})` : ""} — no reply for ${g.ghosting_days}d${val}`)
    }
  }

  // Upcoming meetings needing prep
  const meetings = upcomingMeetingsRes.data || []
  if (meetings.length > 0) {
    totalItems += meetings.length
    lines.push(`\n### 📅 Upcoming Meetings — Prep Needed (${meetings.length})`)
    for (const m of meetings) {
      const time = new Date(m.start_time).toLocaleString("en-US", {
        hour: "numeric", minute: "2-digit", weekday: "short",
      })
      lines.push(`- ${time}: ${m.title}${m.purpose ? ` — ${m.purpose}` : ""}`)
    }
  }

  if (totalItems === 0) {
    lines.push("\nAll clear! No overdue tasks, stale deals, or ghosting contacts.")
  } else {
    lines.unshift(`${totalItems} items need your attention:`)
  }

  return { content: lines.join("\n") }
}
