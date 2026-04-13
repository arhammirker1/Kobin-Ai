// ── MCP-Style Read Tools ────────────────────────────────────────────────────
// Instead of dumping everything into context, the AI calls these tools
// to fetch exactly what it needs, when it needs it.

import { supabaseAdmin } from "@/lib/supabase/admin"
import { withCache, CK } from "@/lib/redis"
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
            enum: ["active", "on-hold", "completed", "archived", "all"],
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
        "Get team members with active/overdue/blocked counts and workload level (FREE/LIGHT/MODERATE/HEAVY). Use before assigning tasks. Optional name filter to inspect one person.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Optional team member name filter (fuzzy match).",
          },
        },
      },
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
      name: "get_task_creation_context",
      description:
        "Call this ONCE before creating or updating a task. Returns team members with workload, all active projects with IDs, and vault files for the specified project. Use the exact names returned here in create_task/update_task calls.",
      parameters: {
        type: "object",
        properties: {
          project_name: {
            type: "string",
            description: "Optional. If provided, also returns vault files for this project.",
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
      name: "get_meeting_notes",
      description:
        "Query past meeting recordings and AI analyses. Search by contact name, topic, or date. Returns summaries, decisions, action items, and CRM updates from meetings.",
      parameters: {
        type: "object",
        properties: {
          contact_name: {
            type: "string",
            description: "Filter by participant/contact name (fuzzy match)",
          },
          topic: {
            type: "string",
            description: "Search for a keyword or topic in meeting transcripts",
          },
          range: {
            type: "string",
            enum: ["last_7_days", "last_30_days", "last_90_days", "all"],
            description: "Time range to search. Default: last_30_days",
          },
          limit: {
            type: "number",
            description: "Max results (default 5, max 10)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "vault_semantic_search",
      description:
        "Semantically search the founder's vault by meaning, not just keywords. Use when the user asks to 'find documents about X', 'what files do we have on Y', or needs vault context.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language search query" },
          project_name: { type: "string", description: "Optional: limit to a project" },
          limit: { type: "number", description: "Max results (default 5)" },
        },
        required: ["query"],
      },
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
  | "get_task_creation_context"
  | "search_contacts"
  | "get_meeting_notes"
  | "vault_semantic_search"

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
      return execTeamWorkload(args, founderId)
    case "get_crm_pipeline":
      return execCRM(args, founderId)
    case "get_calendar":
      return execCalendar(args, founderId)
    case "get_vault_files":
      return execVault(args, founderId)
    case "get_task_creation_context":
      return execTaskCreationContext(args, founderId)
    case "search_contacts":
      return execSearchContacts(args, founderId)
    case "get_meeting_notes":
      return execMeetingNotes(args, founderId)
    case "vault_semantic_search":
      return execVaultSemanticSearch(args, founderId)
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
      .select("id, title, status, priority, due_date, project_id, is_completed")
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
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]))

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

  const topOverdue = tasks
    .filter((t) => t.due_date && new Date(t.due_date) < now)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 5)
  if (topOverdue.length > 0) {
    lines.push(`\n## Critical Overdue Tasks`)
    topOverdue.forEach((t) => {
      const projectName = t.project_id ? projectMap[t.project_id] || "Unlinked" : "Unlinked"
      lines.push(`- [${PRI[t.priority] || "M"}] ${t.title} | ${projectName} | due ${shortDate(t.due_date)}`)
    })
  }

  const upcomingDeadlines = tasks
    .filter((t) => t.due_date && new Date(t.due_date) >= now)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 5)
  if (upcomingDeadlines.length > 0) {
    lines.push(`\n## Upcoming Task Deadlines`)
    upcomingDeadlines.forEach((t) => {
      const projectName = t.project_id ? projectMap[t.project_id] || "Unlinked" : "Unlinked"
      lines.push(`- ${t.title} | ${projectName} | due ${shortDate(t.due_date)}`)
    })
  }

  if (staleDeals.length > 0) {
    lines.push(`\n## Stale Deals (14+ days in stage)`)
    staleDeals.slice(0, 5).forEach((d) => {
      lines.push(`- ${d.pipeline_stage} | $${(d.deal_value || 0).toLocaleString()} | entered ${shortDate(d.stage_entered_at)}`)
    })
  }

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

  // Use cache only for unfiltered full list (used by task creation context)
  const fetchProjects = async () => {
    let query = supabaseAdmin
      .from("projects")
      .select("id, name, description, status, priority, start_date, end_date")
      .eq("founder_id", founderId)
      .order("updated_at", { ascending: false })

    if (status && status !== "all") query = query.eq("status", status)
    if (name) query = query.ilike("name", `%${name}%`)

    const { data, error } = await query
    if (error) return { data: null, error }
    return { data, error: null }
  }

  const useCache = (!status || status === "all") && !name
  const { data: projects, error } = useCache
    ? await withCache(CK.projects(founderId), 60, async () => {
      const result = await fetchProjects()
      return result.data
    }).then(data => ({ data, error: null }))
    : await fetchProjects()

  if (error) return { content: `Error: ${(error as any).message}`, projectData: [] }
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

async function execTeamWorkload(args: Record<string, any>, founderId: string): Promise<ReadToolResult> {
  const nameFilter = (args.name || "").toString().trim().toLowerCase()
  const members = await withCache(CK.teamWorkload(founderId), 30, async () => {
    const { data } = await supabaseAdmin
      .from("team_members")
      .select(
        "user_id, position, is_active, profile:profiles!team_members_user_id_profiles_fkey(full_name, email)"
      )
      .eq("founder_id", founderId)
      .eq("is_active", true)
    return data || []
  })

  if (!members || members.length === 0) return { content: "No active team members.", teamData: [] }

  // Count active/overdue/blocked tasks per member
  const { data: tasks } = await supabaseAdmin
    .from("tasks")
    .select("assigned_to, status, due_date")
    .eq("user_id", founderId)
    .eq("is_completed", false)

  const counts: Record<string, { active: number; overdue: number; blocked: number }> = {}
  const now = new Date()
  for (const t of tasks || []) {
    if (!t.assigned_to) continue
    if (!counts[t.assigned_to]) counts[t.assigned_to] = { active: 0, overdue: 0, blocked: 0 }
    counts[t.assigned_to].active += 1
    if (t.status === "blocked") counts[t.assigned_to].blocked += 1
    if (t.due_date && new Date(t.due_date) < now) counts[t.assigned_to].overdue += 1
  }

  let teamData: TeamMemberContext[] = members.map((m: any) => ({
    user_id: m.user_id,
    full_name: m.profile?.full_name || "Unknown",
    position: m.position || "",
    active_task_count: counts[m.user_id]?.active || 0,
  }))

  if (nameFilter) {
    teamData = teamData.filter((m) => m.full_name.toLowerCase().includes(nameFilter))
  }

  const sorted = [...teamData].sort((a, b) => a.active_task_count - b.active_task_count)

  const lines = [nameFilter ? `Team workload (filtered: ${nameFilter})` : `Team (${sorted.length} members):`]
  if (sorted.length === 0) {
    return { content: `No team members found for "${nameFilter}".`, teamData: [] }
  }
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
      `- ${m.full_name} | ${m.position} | ${m.active_task_count} active | ${counts[m.user_id]?.overdue || 0} overdue | ${counts[m.user_id]?.blocked || 0} blocked [${load}]`
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

  return withCache(CK.calendar(founderId, range), 300, async () => {
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
  })
}

async function execVault(
  args: Record<string, any>,
  founderId: string
): Promise<ReadToolResult> {
  const { project_name, search } = args
  const normalizedProjectName =
    typeof project_name === "string" ? project_name.replace(/^project\s+/i, "").trim() : project_name

  // Create cache key from args (only cache if no search term)
  const cacheKey = `vault:${founderId}:${normalizedProjectName || "all"}:${search || "none"}`

  // Only use cache for unfiltered queries (search queries are unique)
  const useCache = !search

  if (useCache) {
    return withCache(cacheKey, 600, async () => _execVault(args, founderId, normalizedProjectName))
  }

  return _execVault(args, founderId, normalizedProjectName)
}

async function _execVault(
  args: Record<string, any>,
  founderId: string,
  normalizedProjectName: string | null
): Promise<ReadToolResult> {
  const { project_name, search } = args

  // Resolve project
  let projectId: string | null = null
  let projectLabel = "All projects"
  if (normalizedProjectName) {
    const { data } = await supabaseAdmin
      .from("projects")
      .select("id, name")
      .eq("founder_id", founderId)
      .ilike("name", `%${normalizedProjectName}%`)
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

async function execTaskCreationContext(
  args: Record<string, any>,
  founderId: string
): Promise<ReadToolResult> {
  const { project_name } = args
  const now = new Date()
  // Run team + projects in parallel (both Redis-cached)
  const [members, projects] = await Promise.all([
    withCache(CK.teamWorkload(founderId), 30, async () => {
      const { data } = await supabaseAdmin
        .from("team_members")
        .select(
          "user_id, position, is_active, profile:profiles!team_members_user_id_profiles_fkey(full_name, email)"
        )
        .eq("founder_id", founderId)
        .eq("is_active", true)
      return data || []
    }),
    withCache(CK.projects(founderId), 60, async () => {
      const { data } = await supabaseAdmin
        .from("projects")
        .select("id, name, status, priority")
        .eq("founder_id", founderId)
        .in("status", ["active", "on-hold"])
        .order("name")
      return data || []
    }),
  ])

  // (members and projects already resolved above)

  // Task counts per member
  const { data: tasks } = await supabaseAdmin
    .from("tasks")
    .select("assigned_to, status, due_date")
    .eq("user_id", founderId)
    .eq("is_completed", false)

  const counts: Record<string, { active: number; overdue: number; blocked: number }> = {}
  for (const t of tasks || []) {
    if (!t.assigned_to) continue
    if (!counts[t.assigned_to]) counts[t.assigned_to] = { active: 0, overdue: 0, blocked: 0 }
    counts[t.assigned_to].active++
    if (t.status === "blocked") counts[t.assigned_to].blocked++
    if (t.due_date && new Date(t.due_date) < now) counts[t.assigned_to].overdue++
  }

  const teamData: TeamMemberContext[] = members.map((m: any) => ({
    user_id: m.user_id,
    full_name: m.profile?.full_name || "Unknown",
    position: m.position || "",
    active_task_count: counts[m.user_id]?.active || 0,
  }))

  const projectData: ProjectContext[] = projects.map(p => ({ id: p.id, name: p.name, status: p.status }))

  const lines: string[] = []

  lines.push("## Team Members (use exact names in assigned_to_name)")
  const sorted = [...teamData].sort((a, b) => a.active_task_count - b.active_task_count)
  for (const m of sorted) {
    const load = m.active_task_count === 0 ? "FREE" : m.active_task_count <= 3 ? "LIGHT" : m.active_task_count <= 6 ? "MODERATE" : "HEAVY"
    lines.push(`- ${m.full_name} | ${m.position} | ${m.active_task_count} tasks [${load}]`)
  }

  lines.push("\n## Active Projects (use exact names in project_name)")
  for (const p of projects) {
    lines.push(`- ${p.name} | ${p.status} | ${p.priority}`)
  }

  // Vault files for specified project
  if (project_name) {
    const normalizedName = project_name.replace(/^project\s+/i, "").trim()
    const matched = projects.find(p =>
      p.name.toLowerCase().includes(normalizedName.toLowerCase())
    )
    if (matched) {
      const { data: folders } = await supabaseAdmin
        .from("vault_folders")
        .select("id")
        .eq("project_id", matched.id)
        .eq("founder_id", founderId)

      if (folders && folders.length > 0) {
        const folderIds = folders.map(f => f.id)
        const { data: items } = await supabaseAdmin
          .from("vault_items")
          .select("title, item_type, document_type")
          .in("folder_id", folderIds)
          .in("item_type", ["file", "link"])
          .order("created_at", { ascending: false })
          .limit(20)

        if (items && items.length > 0) {
          lines.push(`\n## Vault Files for "${matched.name}" (use exact titles in vault_file_names)`)
          for (const v of items) {
            lines.push(`- "${v.title}" | ${v.document_type} | ${v.item_type}`)
          }
        }
      }
    } else {
      lines.push(`\n## Vault Files\nNo project found matching "${project_name}". Available projects listed above.`)
    }
  } else {
    lines.push("\n## Vault Files\nNo project_name specified — vault files not loaded. If the task needs vault attachments, re-call with project_name.")
  }

  lines.push("\n## Instructions")
  lines.push("Use ONLY the exact names from this output in create_task or update_task. Do NOT invent project names or team member names. If the user did not mention a project, do NOT set project_name.")

  return { content: lines.join("\n"), teamData, projectData }
}

async function execSearchContacts(
  args: Record<string, any>,
  founderId: string
): Promise<ReadToolResult> {
  const { name } = args
  if (!name) return { content: "No name provided to search." }

  // Fuzzy search contacts by name
  const { data: contacts, error } = await supabaseAdmin
    .from("relationships")
    .select(
      "id, full_name, email, company, role, relationship_type, pipeline_stage, deal_value, close_probability, stage_entered_at, expected_close_date, pipeline_notes, linkedin_profile_url, tags, status, created_at, updated_at"
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

    // ── Recent Gmail threads ──────────────────────────────────────────
    const { data: threads } = await supabaseAdmin
      .from("gmail_threads")
      .select("subject, snippet, sender_email, sender_name, last_message_at, message_count, is_unread")
      .eq("user_id", founderId)
      .eq("relationship_id", c.id)
      .order("last_message_at", { ascending: false })
      .limit(5)

    if (threads && threads.length > 0) {
      lines.push(`\nRecent emails (${threads.length}):`)
      for (const t of threads) {
        const date = t.last_message_at ? shortDate(t.last_message_at) : ""
        const unread = t.is_unread ? " [UNREAD]" : ""
        lines.push(`- ${date}: "${t.subject}" (${t.message_count} msgs)${unread}`)
        if (t.snippet) lines.push(`  ${t.snippet.slice(0, 100)}`)
      }
    }

    lines.push("") // spacer between contacts
  }

  return { content: lines.join("\n") }
}

async function execMeetingNotes(
  args: Record<string, any>,
  founderId: string
): Promise<ReadToolResult> {
  const { contact_name, topic, range = "last_30_days", limit = 5 } = args
  const cap = Math.min(limit, 10)
  const now = new Date()

  // Determine date filter
  let since: string
  switch (range) {
    case "last_7_days":
      since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      break
    case "last_90_days":
      since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      break
    case "all":
      since = "1970-01-01T00:00:00.000Z"
      break
    default: // last_30_days
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  }

  // Fetch analyses with their recordings
  let query = supabaseAdmin
    .from("meeting_analyses")
    .select(`
      id, summary, key_decisions, action_items, sentiment, topics,
      crm_matches, tasks_created, notes_created, analyzed_at,
      recording:meeting_recordings_raw!inner(
        meeting_title, duration_seconds, started_at, participant_emails, combined_transcript
      )
    `)
    .eq("user_id", founderId)
    .gte("analyzed_at", since)
    .order("analyzed_at", { ascending: false })
    .limit(cap)

  const { data: analyses, error } = await query
  if (error) return { content: `Error fetching meeting notes: ${error.message}` }
  if (!analyses || analyses.length === 0) {
    return { content: `No meeting recordings found in the ${range.replace(/_/g, " ")} range.` }
  }

  // Filter by contact name if provided
  let filtered = analyses
  if (contact_name) {
    const searchLower = contact_name.toLowerCase()
    filtered = analyses.filter((a: any) => {
      // Check CRM matches
      const matchesContact = (a.crm_matches || []).some(
        (m: any) => (m.name || "").toLowerCase().includes(searchLower)
      )
      // Check participant emails
      const recording = Array.isArray(a.recording) ? a.recording[0] : a.recording
      const matchesEmail = (recording?.participant_emails || []).some(
        (e: string) => e.toLowerCase().includes(searchLower)
      )
      // Check meeting title
      const matchesTitle = (recording?.meeting_title || "").toLowerCase().includes(searchLower)
      return matchesContact || matchesEmail || matchesTitle
    })
  }

  // Filter by topic if provided
  if (topic) {
    const topicLower = topic.toLowerCase()
    filtered = filtered.filter((a: any) => {
      const matchesTopic = (a.topics || []).some(
        (t: string) => t.toLowerCase().includes(topicLower)
      )
      const recording = Array.isArray(a.recording) ? a.recording[0] : a.recording
      const matchesTranscript = (recording?.combined_transcript || "")
        .toLowerCase()
        .includes(topicLower)
      const matchesSummary = (a.summary || "").toLowerCase().includes(topicLower)
      return matchesTopic || matchesTranscript || matchesSummary
    })
  }

  if (filtered.length === 0) {
    const filterDesc = [
      contact_name ? `contact "${contact_name}"` : "",
      topic ? `topic "${topic}"` : "",
    ].filter(Boolean).join(" and ")
    return { content: `No meetings found matching ${filterDesc}.` }
  }

  const lines: string[] = [`${filtered.length} meeting(s) found:`]

  for (const a of filtered) {
    const recording = Array.isArray(a.recording) ? a.recording[0] : a.recording
    const title = recording?.meeting_title || "Untitled"
    const duration = recording?.duration_seconds
      ? `${Math.round(recording.duration_seconds / 60)}min`
      : ""
    const date = a.analyzed_at
      ? new Date(a.analyzed_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      })
      : ""

    lines.push(`\n## ${title} (${date}${duration ? ` · ${duration}` : ""})`)
    lines.push(`Sentiment: ${a.sentiment || "neutral"} | Topics: ${(a.topics || []).join(", ") || "none"}`)

    if (a.summary) lines.push(`Summary: ${a.summary}`)

    // Decisions
    const decisions = a.key_decisions || []
    if (decisions.length > 0) {
      lines.push(`Decisions (${decisions.length}):`)
      for (const d of decisions) {
        lines.push(`- ${d.decision}${d.decided_by ? ` (by ${d.decided_by})` : ""}`)
      }
    }

    // Action items
    const actions = a.action_items || []
    if (actions.length > 0) {
      lines.push(`Action items (${actions.length}):`)
      for (const item of actions) {
        lines.push(`- [${item.priority || "M"}] ${item.action}${item.assignee ? ` → ${item.assignee}` : ""}`)
      }
    }

    // CRM changes
    const crmChanges = (a.crm_matches || []).filter(
      (m: any) => m.stage_before !== m.stage_after
    )
    if (crmChanges.length > 0) {
      lines.push(`CRM updates:`)
      for (const m of crmChanges) {
        lines.push(`- ${m.name}: ${(m.stage_before || "").replace(/_/g, " ")} → ${(m.stage_after || "").replace(/_/g, " ")}`)
      }
    }
  }

  return { content: lines.join("\n") }
}

export async function execVaultSemanticSearch(
  args: Record<string, any>,
  founderId: string
): Promise<ReadToolResult> {
  const { query, project_name, limit = 5 } = args
  const cap = Math.min(limit, 10)

  if (!query?.trim()) return { content: "No search query provided." }

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
  }

  try {
    // Generate embedding via OpenAI
// REPLACE with:
    const embedRes = await fetch(
      "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: query.slice(0, 2000) }),
      }
    )

    if (!embedRes.ok) {
      return execVaultKeyword(args, founderId)
    }

    const embedData = await embedRes.json()
    const embedding = Array.isArray(embedData[0]) ? embedData[0] : embedData
    const vector = `[${embedding.join(",")}]`

    // RPC similarity search
    const { data: similarities } = await supabaseAdmin.rpc("vault_semantic_search", {
      p_founder_id: founderId,
      p_embedding: vector,
      p_limit: cap * 2,
      p_threshold: 0.15,
    })

    if (!similarities || similarities.length === 0) {
      return execVaultKeyword(args, founderId) // fallback
    }

    const itemIds = similarities.map((s: any) => s.vault_item_id)
    console.log(`[VaultSearch/MCP] ${itemIds.length} candidates via vector for "${query}"`)

    // Include note_content + extracted_text so AI can actually summarize documents
    let q = supabaseAdmin
      .from("vault_items")
      .select("id, title, description, item_type, document_type, project_id, note_content, extracted_text")
      .in("id", itemIds)
      .eq("founder_id", founderId)

    if (projectId) q = q.eq("project_id", projectId)

    const { data: items } = await q
    if (!items || items.length === 0) return { content: "No vault items found matching that query." }

    // Resolve project names
    const pIds = [...new Set(items.map((i) => i.project_id).filter(Boolean))] as string[]
    let pMap: Record<string, string> = {}
    if (pIds.length > 0) {
      const { data } = await supabaseAdmin.from("projects").select("id, name").in("id", pIds)
      if (data) pMap = Object.fromEntries(data.map((p) => [p.id, p.name]))
    }

    const simMap = Object.fromEntries(similarities.map((s: any) => [s.vault_item_id, s.similarity]))

    const ranked = items
      .map((item) => ({ ...item, similarity: simMap[item.id] || 0 }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, cap)

    console.log(`[VaultSearch/MCP] Returning top-${ranked.length} results for "${query}"`)

    const lines = [`Vault semantic search — "${query}" (${ranked.length} results):`,
      `NOTE: These documents may belong to clients or projects. Always attribute data to its source title.`]
    for (const item of ranked) {
      const sim = (item.similarity * 100).toFixed(0)
      const proj = item.project_id ? pMap[item.project_id] || "Unknown" : "No project"
      lines.push(`\n### [${sim}% match] "${item.title}" | ${item.document_type} | ${item.item_type} | ${proj}`)
      if (item.description) lines.push(`Description: ${item.description.slice(0, 120)}`)
      // Include actual content so AI can summarize — capped to avoid context overflow
      const content = (item.note_content || item.extracted_text || "").trim()
      if (content) {
        lines.push(`Content (first 800 chars):`)
        lines.push(content.slice(0, 800))
        if (content.length > 800) lines.push(`… [${content.length} chars total — use vault_semantic_search with higher limit for more]`)
      }
    }

    return { content: lines.join("\n") }
  } catch (err: any) {
    console.error("[vault semantic search]", err)
    return execVaultKeyword(args, founderId)
  }
}

// Keyword fallback
async function execVaultKeyword(
  args: Record<string, any>,
  founderId: string
): Promise<ReadToolResult> {
  const { query, limit = 5 } = args
  const { data: items } = await supabaseAdmin
    .from("vault_items")
    .select("id, title, description, item_type, document_type, project_id")
    .eq("founder_id", founderId)
    .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
    .limit(limit)

  if (!items || items.length === 0) {
    return { content: `No vault items found matching "${query}".` }
  }

  const lines = [`Vault keyword search — "${query}" (${items.length} results):`]
  for (const item of items) {
    lines.push(`- "${item.title}" | ${item.document_type} | ${item.item_type}`)
  }
  return { content: lines.join("\n") }
}
