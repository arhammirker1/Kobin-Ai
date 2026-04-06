import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGroqClient, GROQ_MODEL } from "@/lib/ai/groq"
import { sendAIMessage, getAllFounders } from "@/lib/ai/inbox-dm"
import { NextResponse } from "next/server"

export const maxDuration = 300

function verifyCron(request: Request): boolean {
  const ua = request.headers.get("user-agent") || ""
  const auth = request.headers.get("authorization") || ""
  return (
    ua.includes("vercel-cron") ||
    auth === `Bearer ${process.env.CRON_SECRET}`
  )
}

async function buildDigestForFounder(founderId: string): Promise<string | null> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 86400000 - 1)
  const weekEnd = new Date(now.getTime() + 7 * 86400000)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000)

  const [
    profileRes,
    tasksRes,
    eventsRes,
    dealsRes,
    teamRes,
    blockedRes,
    overdueRes,
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("full_name").eq("id", founderId).single(),
    supabaseAdmin
      .from("tasks")
      .select("id, title, status, priority, due_date, assigned_to")
      .eq("user_id", founderId)
      .eq("is_completed", false)
      .lte("due_date", todayEnd.toISOString())
      .order("due_date", { ascending: true })
      .limit(10),
    supabaseAdmin
      .from("events")
      .select("title, start_time, purpose, meeting_link")
      .eq("user_id", founderId)
      .gte("start_time", todayStart.toISOString())
      .lte("start_time", todayEnd.toISOString())
      .order("start_time", { ascending: true }),
    supabaseAdmin
      .from("relationships")
      .select("full_name, company, pipeline_stage, deal_value, stage_entered_at")
      .eq("user_id", founderId)
      .eq("status", "active")
      .not("pipeline_stage", "in", '("closed_won","closed_lost")')
      .lt("stage_entered_at", fourteenDaysAgo.toISOString())
      .order("stage_entered_at", { ascending: true })
      .limit(5),
    supabaseAdmin
      .from("team_members")
      .select("user_id, position, profile:profiles!team_members_user_id_profiles_fkey(full_name)")
      .eq("founder_id", founderId)
      .eq("is_active", true),
    supabaseAdmin
      .from("tasks")
      .select("id, title")
      .eq("user_id", founderId)
      .eq("status", "blocked")
      .eq("is_completed", false)
      .limit(5),
    supabaseAdmin
      .from("tasks")
      .select("id, title, due_date, priority")
      .eq("user_id", founderId)
      .eq("is_completed", false)
      .lt("due_date", now.toISOString())
      .not("due_date", "is", null)
      .limit(5),
  ])

  const profile = profileRes.data
  const firstName = profile?.full_name?.split(" ")[0] || "there"
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" })
  const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric" })

  const tasksDueToday = tasksRes.data || []
  const meetings = eventsRes.data || []
  const staleDeals = dealsRes.data || []
  const blockedTasks = blockedRes.data || []
  const overdueTasks = overdueRes.data || []

  // Build context for Groq
  const contextLines: string[] = [
    `Founder: ${firstName}`,
    `Today: ${dayName}, ${dateStr}`,
    `\nTASKS DUE TODAY (${tasksDueToday.length}):`,
    ...tasksDueToday.map((t) => `- [${t.priority?.toUpperCase()}] ${t.title}`),
    `\nOVERDUE TASKS (${overdueTasks.length}):`,
    ...overdueTasks.map((t) => {
      const days = t.due_date
        ? Math.floor((now.getTime() - new Date(t.due_date).getTime()) / 86400000)
        : 0
      return `- ${t.title} (${days}d overdue)`
    }),
    `\nBLOCKED TASKS (${blockedTasks.length}):`,
    ...blockedTasks.map((t) => `- ${t.title}`),
    `\nMEETINGS TODAY (${meetings.length}):`,
    ...meetings.map((e) => {
      const time = new Date(e.start_time).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
      return `- ${time}: ${e.title}${e.purpose ? ` — ${e.purpose}` : ""}${e.meeting_link ? " [has Meet link]" : ""}`
    }),
    `\nSTALE DEALS NEEDING FOLLOW-UP (${staleDeals.length}):`,
    ...staleDeals.map((d) => {
      const days = d.stage_entered_at
        ? Math.floor((now.getTime() - new Date(d.stage_entered_at).getTime()) / 86400000)
        : 0
      return `- ${d.full_name}${d.company ? ` (${d.company})` : ""} — ${d.pipeline_stage.replace(/_/g, " ")}, ${days} days stale${d.deal_value ? `, $${d.deal_value.toLocaleString()}` : ""}`
    }),
  ]

  if (
    tasksDueToday.length === 0 &&
    overdueTasks.length === 0 &&
    meetings.length === 0 &&
    staleDeals.length === 0 &&
    blockedTasks.length === 0
  ) {
    return `Good morning, ${firstName}! 🌅 ${dayName}, ${dateStr}.\n\nNothing urgent today — your slate is clear. Good time to work on longer-horizon priorities or reach out to someone in your network.`
  }

  const groq = getGroqClient()
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      {
        role: "system",
        content: `You are a sharp executive assistant writing a morning briefing for a founder. Be concise, direct, and actionable. No fluff. Format with emojis for scannability. End with ONE specific highest-leverage action they should take first. Max 200 words.`,
      },
      {
        role: "user",
        content: `Write a morning briefing based on this workspace data:\n\n${contextLines.join("\n")}`,
      },
    ],
    max_tokens: 400,
    temperature: 0.6,
  })

  return completion.choices[0]?.message?.content || null
}

export async function GET(request: Request) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const founders = await getAllFounders()
  const results = { sent: 0, failed: 0 }

  for (const founderId of founders) {
    try {
      const digest = await buildDigestForFounder(founderId)
      if (digest) {
        await sendAIMessage(founderId, digest)
        results.sent++
      }
    } catch (err) {
      console.error(`[CRON:daily-digest] Failed for ${founderId}:`, err)
      results.failed++
    }
  }

  return NextResponse.json({ ok: true, ...results })
}