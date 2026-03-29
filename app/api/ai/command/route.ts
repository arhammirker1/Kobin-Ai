import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGroqClient, GROQ_MODEL } from "@/lib/ai/groq"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { message } = await request.json()
    if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 })

    let founder_id = user.id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_type")
      .eq("id", user.id)
      .single()

    if (profile?.user_type === "team_member") {
      const { data: tm } = await supabaseAdmin
        .from("team_members")
        .select("founder_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single()
      if (tm?.founder_id) founder_id = tm.founder_id
    }

    // Build full workspace context (no room_id = full cross-workspace view)
    const context = await buildCommandContext(founder_id)

    const systemPrompt = `You are the AI command interface for Command Center — an agency operating system. You have full visibility into the entire workspace across all projects, clients, tasks, and relationships.

${context}

## Your Role
- Answer cross-workspace intelligence queries with precision.
- Be direct, structured, and actionable. Founders are busy.
- When listing items, use clear structure (numbered lists, bullet points).
- Reference specific names, deadlines, and amounts where relevant.
- Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`

    const groq = getGroqClient()
    const stream = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      stream: true,
      max_tokens: 1024,
      temperature: 0.5,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || ""
            if (delta) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`)
              )
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
    })

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function buildCommandContext(founder_id: string): Promise<string> {
  const now = new Date()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

  const [
    profileRes,
    allTasksRes,
    eventsRes,
    relationshipsRes,
    projectsRes,
    clientsRes,
    teamRes,
    recentRoomsRes,
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("full_name, email").eq("id", founder_id).single(),

    supabaseAdmin
      .from("tasks")
      .select("title, status, priority, due_date, assigned_to, is_completed, bucket, project_id, updated_at")
      .or(`user_id.eq.${founder_id},created_by.eq.${founder_id}`)
      .order("created_at", { ascending: false })
      .limit(60),

    supabaseAdmin
      .from("events")
      .select("title, start_time, end_time, type, purpose, meeting_link")
      .eq("user_id", founder_id)
      .gte("start_time", now.toISOString())
      .lte("start_time", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("start_time", { ascending: true })
      .limit(15),

    supabaseAdmin
      .from("relationships")
      .select("full_name, company, relationship_type, pipeline_stage, deal_value, stage_entered_at, updated_at, tags")
      .eq("user_id", founder_id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(40),

    supabaseAdmin
      .from("projects")
      .select("name, status, priority, start_date, end_date")
      .eq("founder_id", founder_id)
      .not("status", "eq", "archived")
      .order("updated_at", { ascending: false }),

    supabaseAdmin
      .from("clients")
      .select("name, email, company, status, project_id, has_portal_access")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(20),

    supabaseAdmin
      .from("team_members")
      .select("position, is_active, profile:profiles!team_members_user_id_profiles_fkey(full_name)")
      .eq("founder_id", founder_id)
      .eq("is_active", true),

    // Get last 30 messages across all rooms (summarized for efficiency)
    supabaseAdmin
      .from("chat_messages")
      .select("content, created_at, sender_id, room_id")
      .not("content", "is", null)
      .neq("message_type", "event_invite")
      .neq("message_type", "task_ref")
      .neq("message_type", "ai_response")
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(30),
  ])

  const profile = profileRes.data
  const tasks = allTasksRes.data || []
  const events = eventsRes.data || []
  const relationships = relationshipsRes.data || []
  const projects = projectsRes.data || []
  const clients = clientsRes.data || []
  const team = teamRes.data || []
  const recentMessages = (recentRoomsRes.data || []).reverse()

  // Summarize recent messages to save tokens
  const messageSummary = await summarizeRecentMessages(recentMessages, founder_id)

  const lines: string[] = []

  lines.push(`## Workspace: ${profile?.full_name || "Founder"}`)
  lines.push(`Date: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`)

  // Projects
  if (projects.length > 0) {
    lines.push(`\n## Active Projects (${projects.length})`)
    projects.forEach(p => {
      const deadline = p.end_date ? ` | deadline ${new Date(p.end_date).toLocaleDateString()}` : ""
      lines.push(`- ${p.name} | ${p.status} | ${p.priority}${deadline}`)
    })
  }

  // Task analysis
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < now && !t.is_completed)
  const todayTasks = tasks.filter(t => t.due_date && new Date(t.due_date) <= todayEnd && !t.is_completed)
  const blockedTasks = tasks.filter(t => t.status === "blocked")

  lines.push(`\n## Task Overview`)
  lines.push(`Total active: ${tasks.filter(t => !t.is_completed).length} | Overdue: ${overdueTasks.length} | Blocked: ${blockedTasks.length} | Due today: ${todayTasks.length}`)

  if (overdueTasks.length > 0) {
    lines.push(`\nOverdue tasks:`)
    overdueTasks.slice(0, 10).forEach(t => {
      const days = Math.floor((now.getTime() - new Date(t.due_date!).getTime()) / (1000 * 60 * 60 * 24))
      lines.push(`- [${t.priority.toUpperCase()}] ${t.title} | ${days}d overdue`)
    })
  }

  if (blockedTasks.length > 0) {
    lines.push(`\nBlocked tasks:`)
    blockedTasks.slice(0, 8).forEach(t => lines.push(`- ${t.title}`))
  }

  // Upcoming events
  if (events.length > 0) {
    lines.push(`\n## Upcoming Calendar (next 7 days)`)
    events.forEach(e => {
      const date = new Date(e.start_time).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      lines.push(`- ${e.title} | ${e.type} | ${date}`)
    })
  }

  // CRM analysis
  const staleContacts = relationships.filter(r =>
    r.stage_entered_at && new Date(r.stage_entered_at) < fourteenDaysAgo &&
    !["closed_won", "closed_lost"].includes(r.pipeline_stage)
  )
  const pipelineValue = relationships.reduce((sum, r) => sum + (r.deal_value || 0), 0)

  lines.push(`\n## CRM Pipeline`)
  lines.push(`Active contacts: ${relationships.length} | Pipeline value: $${pipelineValue.toLocaleString()} | Stale (14+ days): ${staleContacts.length}`)

  relationships.slice(0, 20).forEach(r => {
    const deal = r.deal_value ? ` | $${r.deal_value.toLocaleString()}` : ""
    const days = r.stage_entered_at ? Math.floor((now.getTime() - new Date(r.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24)) : 0
    lines.push(`- ${r.full_name}${r.company ? ` (${r.company})` : ""} | ${r.pipeline_stage} | ${days}d in stage${deal}`)
  })

  // Clients
  if (clients.length > 0) {
    lines.push(`\n## Clients (${clients.length})`)
    clients.forEach(c => {
      lines.push(`- ${c.name}${c.company ? ` (${c.company})` : ""} | ${c.status}${c.has_portal_access ? " | has portal" : ""}`)
    })
  }

  // Team
  if (team.length > 0) {
    lines.push(`\n## Team (${team.length} active)`)
    team.forEach((m: any) => lines.push(`- ${m.profile?.full_name} | ${m.position}`))
  }

  // Recent message summary
  if (messageSummary) {
    lines.push(`\n## Recent Workspace Activity (last 7 days — summarized)`)
    lines.push(messageSummary)
  }

  return lines.join("\n")
}

async function summarizeRecentMessages(
  messages: Array<{ content: string | null; created_at: string; sender_id: string; room_id: string }>,
  founder_id: string
): Promise<string> {
  if (messages.length === 0) return ""

  // Build a compact transcript
  const transcript = messages
    .filter(m => m.content && m.content.length > 5)
    .map(m => {
      const time = new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      const sender = m.sender_id === founder_id ? "Founder" : "Team/Client"
      return `[${time}] ${sender}: ${m.content!.slice(0, 120)}`
    })
    .join("\n")

  if (!transcript) return ""

  try {
    const groq = getGroqClient()
    const result = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant", // use fast small model for summarization
      messages: [
        {
          role: "system",
          content: "Summarize the following workspace messages in 3-5 bullet points. Focus on: open questions, client requests, decisions made, and blockers. Be extremely concise."
        },
        { role: "user", content: transcript }
      ],
      max_tokens: 200,
      temperature: 0.3,
    })
    return result.choices[0]?.message?.content || ""
  } catch {
    // If summarization fails, return a simple excerpt
    return messages.slice(0, 5).map(m => `- ${m.content?.slice(0, 80)}`).join("\n")
  }
}