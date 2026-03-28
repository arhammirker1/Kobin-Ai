import { supabaseAdmin } from "@/lib/supabase/admin"

interface ContextOptions {
  founder_id: string
  room_id?: string
  project_id?: string
}

export async function buildContext(options: ContextOptions): Promise<string> {
  const { founder_id, room_id, project_id } = options

  // Run all queries in parallel
  const [
    profileRes,
    tasksRes,
    eventsRes,
    vaultRes,
    crmRes,
    roomRes,
    messagesRes,
  ] = await Promise.all([
    // Founder profile
    supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", founder_id)
      .single(),

    // Active tasks — scoped to project if room has one, otherwise all
    (() => {
      const q = supabaseAdmin
        .from("tasks")
        .select("title, status, priority, due_date, assigned_to, is_completed, bucket, project_id")
        .eq("user_id", founder_id)
        .eq("is_completed", false)
        .order("created_at", { ascending: false })
      return project_id
        ? q.eq("project_id", project_id).limit(20)
        : q.limit(30)
    })(),

    // Upcoming calendar events (next 7 days)
    supabaseAdmin
      .from("events")
      .select("title, start_time, end_time, type, purpose, meeting_link")
      .eq("user_id", founder_id)
      .gte("start_time", new Date().toISOString())
      .lte("start_time", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("start_time", { ascending: true })
      .limit(10),

    // Vault items — scoped to project if available
    (() => {
      const q = supabaseAdmin
        .from("vault_items")
        .select("title, description, document_type, item_type, created_at, added_by_type")
        .eq("founder_id", founder_id)
        .order("created_at", { ascending: false })
      return project_id
        ? q.eq("project_id", project_id).limit(15)
        : q.limit(20)
    })(),

    // CRM contacts
    supabaseAdmin
      .from("relationships")
      .select("full_name, company, role, relationship_type, pipeline_stage, deal_value, stage_entered_at, tags")
      .eq("user_id", founder_id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(20),

    // Room info (if room_id provided)
    room_id
      ? supabaseAdmin
          .from("chat_rooms")
          .select("name, type, project_id")
          .eq("id", room_id)
          .single()
      : Promise.resolve({ data: null }),

    // Last 20 messages in the room
    room_id
      ? supabaseAdmin
          .from("chat_messages")
          .select("content, sender_id, created_at, message_type")
          .eq("room_id", room_id)
          .neq("message_type", "event_invite")
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: null }),
  ])

  const profile = profileRes.data
  const tasks = tasksRes.data || []
  const events = eventsRes.data || []
  const vault = vaultRes.data || []
  const crm = crmRes.data || []
  const room = roomRes.data
  const messages = (messagesRes.data || []).reverse()

  // If room has a project, fetch project details
  let project = null
  const resolvedProjectId = project_id || room?.project_id || null

  // Re-scope tasks and vault to resolved project if we got it from the room
  // (project_id passed in options may be null even if room has one)
  if (resolvedProjectId && !project_id) {
    // Re-fetch tasks scoped to the resolved project
    const [scopedTasks, scopedVault] = await Promise.all([
      supabaseAdmin
        .from("tasks")
        .select("title, status, priority, due_date, assigned_to, is_completed, bucket, project_id")
        .eq("user_id", founder_id)
        .eq("is_completed", false)
        .eq("project_id", resolvedProjectId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("vault_items")
        .select("title, description, document_type, item_type, created_at, added_by_type")
        .eq("founder_id", founder_id)
        .eq("project_id", resolvedProjectId)
        .order("created_at", { ascending: false })
        .limit(15),
    ])
    if (scopedTasks.data?.length) tasks.splice(0, tasks.length, ...scopedTasks.data)
    if (scopedVault.data?.length) vault.splice(0, vault.length, ...scopedVault.data)
  }

  if (resolvedProjectId) {
    const { data } = await supabaseAdmin
      .from("projects")
      .select("name, description, status, priority, start_date, end_date")
      .eq("id", resolvedProjectId)
      .single()
    project = data
  }

  // Assemble context string
  const lines: string[] = []

  lines.push(`## Workspace Identity`)
  lines.push(`Founder: ${profile?.full_name || "Unknown"}`)
  lines.push(`Email: ${profile?.email || "Unknown"}`)
  lines.push(`Today: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`)

  if (room) {
    lines.push(`\n## Current Room`)
    lines.push(`Room type: ${room.type}`)
    if (room.name) lines.push(`Room name: ${room.name}`)
  }

  if (project) {
    lines.push(`\n## Active Project`)
    lines.push(`Name: ${project.name}`)
    if (project.description) lines.push(`Description: ${project.description}`)
    lines.push(`Status: ${project.status}`)
    lines.push(`Priority: ${project.priority}`)
    if (project.start_date) lines.push(`Start: ${project.start_date}`)
    if (project.end_date) lines.push(`Deadline: ${project.end_date}`)
  }

  if (tasks.length > 0) {
    lines.push(`\n## Active Tasks (${tasks.length})`)
    tasks.forEach((t) => {
      const due = t.due_date ? ` | due ${new Date(t.due_date).toLocaleDateString()}` : ""
      const overdue = t.due_date && new Date(t.due_date) < new Date() ? " [OVERDUE]" : ""
      lines.push(`- [${t.priority.toUpperCase()}] ${t.title} | ${t.status}${due}${overdue}`)
    })
  }

  if (events.length > 0) {
    lines.push(`\n## Upcoming Calendar Events`)
    events.forEach((e) => {
      const date = new Date(e.start_time).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
      })
      lines.push(`- ${e.title} | ${e.type} | ${date}${e.purpose ? ` | ${e.purpose}` : ""}`)
    })
  }

  if (vault.length > 0) {
    lines.push(`\n## Vault Files & Documents`)
    vault.forEach((v) => {
      lines.push(`- [${v.document_type}] ${v.title}${v.description ? `: ${v.description}` : ""}`)
    })
  }

  if (crm.length > 0) {
    lines.push(`\n## CRM Contacts`)
    crm.forEach((c) => {
      const deal = c.deal_value ? ` | $${c.deal_value.toLocaleString()}` : ""
      lines.push(`- ${c.full_name}${c.company ? ` (${c.company})` : ""} | ${c.relationship_type} | Stage: ${c.pipeline_stage}${deal}`)
    })
  }

  if (messages.length > 0) {
    lines.push(`\n## Recent Conversation (last ${messages.length} messages)`)
    messages.forEach((m) => {
      if (!m.content) return
      try {
        const parsed = JSON.parse(m.content)
        if (parsed.type === "event_invite") return
      } catch {}
      const time = new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      lines.push(`[${time}] ${m.sender_id === founder_id ? "Founder" : "Other"}: ${m.content.slice(0, 200)}`)
    })
  }

  return lines.join("\n")
}