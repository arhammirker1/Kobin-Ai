import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGroqClient } from "@/lib/ai/groq"
import type { TeamMemberContext, ProjectContext } from "@/lib/ai/action-executor"

export interface CommandContextResult {
  contextText: string
  teamMembers: TeamMemberContext[]
  projects: ProjectContext[]
}

export async function buildCommandContext(founder_id: string): Promise<CommandContextResult> {
  console.log("[CMD-CTX] buildCommandContext called with founder_id:", founder_id)
  const now = new Date()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

  const [
    profileRes,
    activeTasksRes,
    completedTasksRes,
    allProjectsRes,
    allEventsRes,
    upcomingEventsRes,
    allRelationshipsRes,
    allClientsRes,
    teamMembersRes,
    vaultItemsRes,
    vaultFoldersRes,
    allRoomsRes,
    recentMessagesRes,
    linkedinPostsRes,
  ] = await Promise.all([
    // Full profile
    supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", founder_id)
      .single(),

    // Active (incomplete) tasks — always fetched in full
    supabaseAdmin
      .from("tasks")
      .select("id, title, status, priority, due_date, assigned_to, is_completed, bucket, project_id, notes, created_at, deliverable_required, deliverable_vault_item_id")
      .eq("user_id", founder_id)
      .eq("is_completed", false)
      .order("created_at", { ascending: false })
      .limit(100),

    // Recently completed tasks — for stats
    supabaseAdmin
      .from("tasks")
      .select("id, title, status, priority, due_date, assigned_to, is_completed, bucket, project_id, notes, created_at, deliverable_required, deliverable_vault_item_id")
      .eq("user_id", founder_id)
      .eq("is_completed", true)
      .order("created_at", { ascending: false })
      .limit(50),

    // ALL projects — every status
    supabaseAdmin
      .from("projects")
      .select("id, name, description, status, priority, start_date, end_date, created_at, updated_at")
      .eq("founder_id", founder_id)
      .order("updated_at", { ascending: false }),

    // Past events (last 30 days) for context
    supabaseAdmin
      .from("events")
      .select("id, title, start_time, end_time, type, purpose, meeting_link, outcome")
      .eq("user_id", founder_id)
      .gte("start_time", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .lt("start_time", now.toISOString())
      .order("start_time", { ascending: false })
      .limit(20),

    // Upcoming events (next 14 days)
    supabaseAdmin
      .from("events")
      .select("id, title, start_time, end_time, type, purpose, meeting_link")
      .eq("user_id", founder_id)
      .gte("start_time", now.toISOString())
      .lte("start_time", new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString())
      .order("start_time", { ascending: true })
      .limit(20),

    // ALL relationships — active + pipeline details
    supabaseAdmin
      .from("relationships")
      .select("id, full_name, company, role, relationship_type, pipeline_stage, deal_value, close_probability, stage_entered_at, expected_close_date, pipeline_notes, status, tags, email, updated_at")
      .eq("user_id", founder_id)
      .order("updated_at", { ascending: false })
      .limit(60),

    // ALL clients — full details
    supabaseAdmin
      .from("clients")
      .select("id, name, email, company, role, status, project_id, has_portal_access, can_create_tasks, notes, tags, created_at")
      .eq("founder_id", founder_id)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(30),

    // Team members — full details
    supabaseAdmin
      .from("team_members")
      .select("id, user_id, position, is_active, can_view_tasks, can_create_tasks, can_view_projects, can_create_projects, can_access_clients, profile:profiles!team_members_user_id_profiles_fkey(full_name, email)")
      .eq("founder_id", founder_id),

    // Vault items — all projects
    supabaseAdmin
      .from("vault_items")
      .select("id, title, description, document_type, item_type, project_id, folder_id, added_by_type, created_at")
      .eq("founder_id", founder_id)
      .order("created_at", { ascending: false })
      .limit(50),

    // Vault folders — structure
    supabaseAdmin
      .from("vault_folders")
      .select("id, name, folder_type, project_id")
      .eq("founder_id", founder_id)
      .order("created_at", { ascending: true }),

    // All chat rooms
    supabaseAdmin
      .from("chat_rooms")
      .select("id, name, type, project_id")
      .or(`founder_id.eq.${founder_id},created_by.eq.${founder_id}`)
      .limit(20),

    // Recent messages across ALL rooms (last 7 days)
    supabaseAdmin
      .from("chat_messages")
      .select("content, created_at, sender_id, room_id, message_type")
      .not("content", "is", null)
      .or("message_type.is.null,message_type.not.in.(event_invite,task_ref,ai_response)")
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(50),

    // LinkedIn drafts
    supabaseAdmin
      .from("linkedin_posts")
      .select("content, status, created_at, impressions, engagement_count")
      .eq("user_id", founder_id)
      .order("created_at", { ascending: false })
      .limit(10),
  ])

  // ── DEBUG: Raw query results ──
  console.log("[CMD-CTX] activeTasksRes error:", activeTasksRes.error)
  console.log("[CMD-CTX] activeTasksRes.data count:", activeTasksRes.data?.length ?? "null")
  console.log("[CMD-CTX] activeTasksRes.data:", JSON.stringify(activeTasksRes.data, null, 2))
  console.log("[CMD-CTX] completedTasksRes error:", completedTasksRes.error)
  console.log("[CMD-CTX] completedTasksRes.data count:", completedTasksRes.data?.length ?? "null")
  console.log("[CMD-CTX] allProjectsRes error:", allProjectsRes.error)
  console.log("[CMD-CTX] allProjectsRes.data count:", allProjectsRes.data?.length ?? "null")

  const profile = profileRes.data
  const activeTasks = activeTasksRes.data || []
  const completedTasks = completedTasksRes.data || []
  const tasks = [...activeTasks, ...completedTasks]
  const projects = allProjectsRes.data || []
  const pastEvents = allEventsRes.data || []
  const upcomingEvents = upcomingEventsRes.data || []
  const relationships = allRelationshipsRes.data || []
  const clients = allClientsRes.data || []
  const team = teamMembersRes.data || []
  const vaultItems = vaultItemsRes.data || []
  const vaultFolders = vaultFoldersRes.data || []
  const rooms = allRoomsRes.data || []
  const recentMessages = (recentMessagesRes.data || []).reverse()
  const linkedinPosts = linkedinPostsRes.data || []

  console.log("[CMD-CTX] Task counts — active:", activeTasks.length, "completed:", completedTasks.length)

  // Fetch task-to-assignee name mapping
  const assigneeIds = [...new Set(tasks.map(t => t.assigned_to).filter(Boolean))] as string[]
  let assigneeMap: Record<string, string> = {}
  if (assigneeIds.length > 0) {
    const { data: assigneeProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", assigneeIds)
    if (assigneeProfiles) {
      assigneeMap = Object.fromEntries(assigneeProfiles.map(p => [p.id, p.full_name]))
    }
  }

  // Fetch project-name map for tasks
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]))

  // Task stats — activeTasks and completedTasks already separated by DB queries
  const overdueTasks = activeTasks.filter(t => t.due_date && new Date(t.due_date) < now)
  const blockedTasks = activeTasks.filter(t => t.status === "blocked")
  const todayTasks = activeTasks.filter(t => t.due_date && new Date(t.due_date) <= todayEnd)

  // Pipeline stats
  const activeDeals = relationships.filter(r => r.status === "active" && !["closed_won", "closed_lost"].includes(r.pipeline_stage))
  const closedWon = relationships.filter(r => r.pipeline_stage === "closed_won")
  const staleContacts = activeDeals.filter(r => r.stage_entered_at && new Date(r.stage_entered_at) < fourteenDaysAgo)
  const totalPipelineValue = activeDeals.reduce((s, r) => s + (r.deal_value || 0), 0)
  const weightedPipelineValue = activeDeals.reduce((s, r) => {
    if (!r.deal_value || r.close_probability == null) return s
    return s + (r.deal_value * r.close_probability) / 100
  }, 0)
  const wonValue = closedWon.reduce((s, r) => s + (r.deal_value || 0), 0)

  const lines: string[] = []

  // ── Identity ──────────────────────────────────────────────────────────────
  lines.push(`## Founder`)
  lines.push(`Name: ${profile?.full_name || "Unknown"}`)
  lines.push(`Email: ${profile?.email || "Unknown"}`)
  lines.push(`Today: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`)
  lines.push(`Time: ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`)

  // ── Build structured team data with workload ─────────────────────────────
  const teamMemberContexts: TeamMemberContext[] = team
    .filter((m: any) => m.is_active)
    .map((m: any) => {
      const taskCount = activeTasks.filter(t => t.assigned_to === m.user_id).length
      return {
        user_id: m.user_id,
        full_name: m.profile?.full_name || "Unknown",
        position: m.position || "",
        active_task_count: taskCount,
      }
    })

  // ── Build structured project data ─────────────────────────────────────────
  const projectContexts: ProjectContext[] = projects.map(p => ({
    id: p.id,
    name: p.name,
    status: p.status,
  }))

  // ── Team ──────────────────────────────────────────────────────────────────
  lines.push(`\n## Team (${team.length} members)`)
  if (team.length === 0) {
    lines.push(`No team members yet.`)
  } else {
    team.forEach((m: any) => {
      const status = m.is_active ? "active" : "inactive"
      lines.push(`- ${m.profile?.full_name} | ${m.position} | ${status} | email: ${m.profile?.email}`)
    })
  }

  // ── Team Workload (for assignment suggestions) ────────────────────────────
  if (teamMemberContexts.length > 0) {
    lines.push(`\n## Team Workload (active task counts)`)
    const sorted = [...teamMemberContexts].sort((a, b) => a.active_task_count - b.active_task_count)
    sorted.forEach(m => {
      const load = m.active_task_count === 0 ? "FREE" : m.active_task_count <= 3 ? "LIGHT" : m.active_task_count <= 6 ? "MODERATE" : "HEAVY"
      lines.push(`- ${m.full_name} (${m.position}): ${m.active_task_count} active tasks [${load}]`)
    })
    lines.push(`Suggestion: When assigning tasks, prefer team members with LIGHT or FREE workload.`)
  }

  // ── Projects ──────────────────────────────────────────────────────────────
  lines.push(`\n## All Projects (${projects.length})`)
  projects.forEach(p => {
    const taskCount = tasks.filter(t => t.project_id === p.id).length
    const activeTaskCount = activeTasks.filter(t => t.project_id === p.id).length
    const completedTaskCount = completedTasks.filter(t => t.project_id === p.id).length
    const overdueCount = overdueTasks.filter(t => t.project_id === p.id).length
    const start = p.start_date ? ` | started ${new Date(p.start_date).toLocaleDateString()}` : ""
    const deadline = p.end_date ? ` | deadline ${new Date(p.end_date).toLocaleDateString()}` : ""
    lines.push(`- [${p.status.toUpperCase()}] ${p.name} | ${p.priority} priority${start}${deadline}`)
    lines.push(`  Tasks: ${activeTaskCount} active, ${completedTaskCount} done, ${overdueCount} overdue (${taskCount} total)`)
    if (p.description) lines.push(`  Description: ${p.description}`)
  })

  // ── Tasks ─────────────────────────────────────────────────────────────────
  lines.push(`\n## Task Summary`)
  lines.push(`Active: ${activeTasks.length} | Completed: ${completedTasks.length} | Overdue: ${overdueTasks.length} | Blocked: ${blockedTasks.length} | Due today: ${todayTasks.length}`)

  if (overdueTasks.length > 0) {
    lines.push(`\n### Overdue Tasks`)
    overdueTasks.forEach(t => {
      const days = Math.floor((now.getTime() - new Date(t.due_date!).getTime()) / (1000 * 60 * 60 * 24))
      const assignee = t.assigned_to ? ` | assigned to ${assigneeMap[t.assigned_to] || t.assigned_to}` : ""
      const project = t.project_id ? ` | project: ${projectMap[t.project_id] || t.project_id}` : ""
      lines.push(`- [${t.priority.toUpperCase()}] ${t.title} | ${t.status} | ${days}d overdue${assignee}${project}`)
      if (t.notes) lines.push(`  Notes: ${t.notes.slice(0, 100)}`)
    })
  }

  if (blockedTasks.length > 0) {
    lines.push(`\n### Blocked Tasks`)
    blockedTasks.forEach(t => {
      const assignee = t.assigned_to ? ` | assigned to ${assigneeMap[t.assigned_to] || t.assigned_to}` : ""
      const project = t.project_id ? ` | project: ${projectMap[t.project_id] || t.project_id}` : ""
      lines.push(`- ${t.title}${assignee}${project}`)
    })
  }

  if (todayTasks.length > 0) {
    lines.push(`\n### Due Today`)
    todayTasks.forEach(t => {
      const assignee = t.assigned_to ? ` | assigned to ${assigneeMap[t.assigned_to] || t.assigned_to}` : ""
      lines.push(`- [${t.priority.toUpperCase()}] ${t.title} | ${t.status}${assignee}`)
    })
  }

  lines.push(`\n### All Active Tasks`)
  activeTasks.slice(0, 40).forEach(t => {
    const assignee = t.assigned_to ? ` | ${assigneeMap[t.assigned_to] || "assigned"}` : ""
    const project = t.project_id ? ` | ${projectMap[t.project_id] || "project"}` : ""
    const due = t.due_date ? ` | due ${new Date(t.due_date).toLocaleDateString()}` : ""
    const overdue = t.due_date && new Date(t.due_date) < now ? " [OVERDUE]" : ""
    lines.push(`- [${t.priority.toUpperCase()}] ${t.title} | ${t.status}${due}${overdue}${assignee}${project}`)
  })

  // ── Calendar ──────────────────────────────────────────────────────────────
  if (upcomingEvents.length > 0) {
    lines.push(`\n## Upcoming Calendar (next 14 days)`)
    upcomingEvents.forEach(e => {
      const date = new Date(e.start_time).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      lines.push(`- ${e.title} | ${e.type} | ${date}${e.purpose ? ` | ${e.purpose}` : ""}${e.meeting_link ? " | has Meet link" : ""}`)
    })
  } else {
    lines.push(`\n## Upcoming Calendar\nNo upcoming events in the next 14 days.`)
  }

  if (pastEvents.length > 0) {
    lines.push(`\n## Recent Past Events (last 30 days)`)
    pastEvents.slice(0, 10).forEach(e => {
      const date = new Date(e.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      lines.push(`- ${e.title} | ${date}${e.outcome ? ` | outcome: ${e.outcome.slice(0, 80)}` : ""}`)
    })
  }

  // ── CRM Pipeline ──────────────────────────────────────────────────────────
  lines.push(`\n## CRM Pipeline`)
  lines.push(`Total pipeline value: $${totalPipelineValue.toLocaleString()} | Weighted: $${Math.round(weightedPipelineValue).toLocaleString()} | Won: $${wonValue.toLocaleString()}`)
  lines.push(`Active deals: ${activeDeals.length} | Stale (14+ days no movement): ${staleContacts.length} | Closed won: ${closedWon.length}`)

  const stageOrder = ["new_lead", "contacted", "meeting_booked", "proposal", "negotiating", "closed_won", "closed_lost"]
  stageOrder.forEach(stage => {
    const inStage = relationships.filter(r => r.pipeline_stage === stage)
    if (inStage.length === 0) return
    lines.push(`\n### ${stage.replace(/_/g, " ").toUpperCase()} (${inStage.length})`)
    inStage.forEach(r => {
      const days = r.stage_entered_at ? Math.floor((now.getTime() - new Date(r.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24)) : 0
      const deal = r.deal_value ? ` | $${r.deal_value.toLocaleString()}${r.close_probability != null ? ` @ ${r.close_probability}%` : ""}` : ""
      const stale = days > 14 && !["closed_won", "closed_lost"].includes(stage) ? " [STALE]" : ""
      lines.push(`- ${r.full_name}${r.company ? ` (${r.company})` : ""} | ${r.relationship_type} | ${days}d in stage${deal}${stale}`)
      if (r.pipeline_notes) lines.push(`  Notes: ${r.pipeline_notes.slice(0, 100)}`)
      if (r.expected_close_date) lines.push(`  Expected close: ${new Date(r.expected_close_date).toLocaleDateString()}`)
    })
  })

  // ── Clients ───────────────────────────────────────────────────────────────
  lines.push(`\n## Clients (${clients.length})`)
  clients.forEach(c => {
    const project = c.project_id ? ` | project: ${projectMap[c.project_id] || c.project_id}` : ""
    const portal = c.has_portal_access ? " | portal: yes" : " | portal: no"
    lines.push(`- ${c.name}${c.company ? ` (${c.company})` : ""} | ${c.status}${portal}${project}`)
    if (c.notes) lines.push(`  Notes: ${c.notes.slice(0, 80)}`)
  })

  // ── Vault ─────────────────────────────────────────────────────────────────
  if (vaultItems.length > 0) {
    lines.push(`\n## Vault (${vaultItems.length} items)`)
    lines.push(`Note: These files can be attached to tasks using vault_file_names. Only attach files from the task's linked project.`)
    // Group by project
    const itemsByProject: Record<string, typeof vaultItems> = {}
    vaultItems.forEach(item => {
      const key = item.project_id ? (projectMap[item.project_id] || item.project_id) : "General"
      if (!itemsByProject[key]) itemsByProject[key] = []
      itemsByProject[key].push(item)
    })
    Object.entries(itemsByProject).forEach(([proj, items]) => {
      lines.push(`\n  Project: ${proj}`)
      items.forEach(v => {
        const typeIcon = v.item_type === "file" ? "📄" : "🔗"
        lines.push(`  - ${typeIcon} "${v.title}" | ${v.document_type} | ${v.item_type}${v.description ? ` | ${v.description.slice(0, 60)}` : ""}`)
      })
    })
  }

  // ── LinkedIn ──────────────────────────────────────────────────────────────
  if (linkedinPosts.length > 0) {
    lines.push(`\n## LinkedIn Content`)
    const drafts = linkedinPosts.filter(p => p.status === "draft")
    const published = linkedinPosts.filter(p => p.status === "Published")
    lines.push(`Drafts: ${drafts.length} | Published: ${published.length}`)
    if (published.length > 0) {
      const totalImpressions = published.reduce((s, p) => s + (p.impressions || 0), 0)
      const totalEngagements = published.reduce((s, p) => s + (p.engagement_count || 0), 0)
      lines.push(`Total impressions: ${totalImpressions} | Total engagements: ${totalEngagements}`)
    }
  }

  // ── Recent workspace messages ──────────────────────────────────────────────
  if (recentMessages.length > 0) {
    lines.push(`\n## Recent Workspace Activity (last 7 days)`)

    // Build room name map
    const roomMap = Object.fromEntries(rooms.map(r => [r.id, r.name || r.type]))
    const projectRoomMap = Object.fromEntries(rooms.filter(r => r.project_id).map(r => [r.id, projectMap[r.project_id!] || r.name || "project"]))

    // Group by room for clarity
    const byRoom: Record<string, typeof recentMessages> = {}
    recentMessages.forEach(m => {
      if (!byRoom[m.room_id]) byRoom[m.room_id] = []
      byRoom[m.room_id].push(m)
    })

    for (const [roomId, msgs] of Object.entries(byRoom)) {
      const roomLabel = projectRoomMap[roomId] || roomMap[roomId] || "DM"
      lines.push(`\n  Channel: ${roomLabel}`)
      msgs.slice(0, 8).forEach(m => {
        if (!m.content) return
        try { const p = JSON.parse(m.content); if (p.type) return } catch {}
        const time = new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        const sender = m.sender_id === founder_id ? profile?.full_name || "Founder" : "Team/Client"
        lines.push(`  [${time}] ${sender}: ${m.content.slice(0, 150)}`)
      })
    }
  }

  const finalContext = lines.join("\n")
  console.log("[CMD-CTX] === FULL CONTEXT START ===")
  console.log(finalContext)
  console.log("[CMD-CTX] === FULL CONTEXT END ===")
  console.log("[CMD-CTX] Context length:", finalContext.length, "chars")
  return {
    contextText: finalContext,
    teamMembers: teamMemberContexts,
    projects: projectContexts,
  }
}