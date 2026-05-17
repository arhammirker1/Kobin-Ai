import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGroqClient, GROQ_MODEL } from "@/lib/ai/groq"
import { sendAIMessage, getAllFounders } from "@/lib/ai/inbox-dm"
import { NextResponse } from "next/server"

export const maxDuration = 300

function verifyCron(request: Request): boolean {
  const ua = request.headers.get("user-agent") || ""
  const auth = request.headers.get("authorization") || ""
  return ua.includes("vercel-cron") || auth === `Bearer ${process.env.CRON_SECRET}`
}

async function buildWeeklyReviewForFounder(founderId: string): Promise<string | null> {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)

  const [profileRes, completedRes, slippedRes, createdRes, teamRes, dealsRes, eventsRes] =
    await Promise.all([
      supabaseAdmin.from("profiles").select("full_name").eq("id", founderId).single(),

      // Completed last 7 days
      supabaseAdmin
        .from("tasks")
        .select("id, title, priority, assigned_to, project_id")
        .eq("user_id", founderId)
        .eq("is_completed", true)
        .gte("updated_at", sevenDaysAgo.toISOString()),

      // Slipped: due last week, not completed
      supabaseAdmin
        .from("tasks")
        .select("id, title, priority, due_date")
        .eq("user_id", founderId)
        .eq("is_completed", false)
        .gte("due_date", sevenDaysAgo.toISOString())
        .lte("due_date", now.toISOString())
        .limit(10),

      // Created last week
      supabaseAdmin
        .from("tasks")
        .select("id")
        .eq("user_id", founderId)
        .gte("created_at", sevenDaysAgo.toISOString()),

      // Team tasks completed
      supabaseAdmin
        .from("team_members")
        .select("user_id, position, profile:profiles!team_members_user_id_profiles_fkey(full_name)")
        .eq("founder_id", founderId)
        .eq("is_active", true),

      // CRM: deals moved forward last week
      supabaseAdmin
        .from("relationships")
        .select("full_name, company, pipeline_stage, deal_value, stage_entered_at")
        .eq("user_id", founderId)
        .eq("status", "active")
        .gte("stage_entered_at", sevenDaysAgo.toISOString())
        .not("pipeline_stage", "in", '("new_lead","closed_lost")'),

      // Meetings last week
      supabaseAdmin
        .from("events")
        .select("id, title, outcome")
        .eq("user_id", founderId)
        .gte("start_time", sevenDaysAgo.toISOString())
        .lte("start_time", now.toISOString()),
    ])

  const firstName = profileRes.data?.full_name?.split(" ")[0] || "there"
  const completed = completedRes.data || []
  const slipped = slippedRes.data || []
  const created = createdRes.data || []
  const deals = dealsRes.data || []
  const meetings = eventsRes.data || []
  const team = teamRes.data || []

  // Team workload for context
  const teamWorkload: Record<string, number> = {}
  completed.forEach((t) => {
    if (t.assigned_to) {
      teamWorkload[t.assigned_to] = (teamWorkload[t.assigned_to] || 0) + 1
    }
  })

  const weekStart = sevenDaysAgo.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  const weekEndStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric" })

  const contextLines = [
    `Founder: ${firstName}`,
    `Week: ${weekStart} – ${weekEndStr}`,
    `\nTASKS COMPLETED: ${completed.length}`,
    `TASKS CREATED: ${created.length}`,
    `TASKS SLIPPED (due but not done): ${slipped.length}`,
    slipped.length > 0 ? slipped.map((t) => `- ${t.title} [${t.priority}]`).join("\n") : "",
    `\nDEALS ADVANCED: ${deals.length}`,
    ...deals.map(
      (d) =>
        `- ${d.full_name}${d.company ? ` (${d.company})` : ""} → ${d.pipeline_stage.replace(/_/g, " ")}${d.deal_value ? ` ($${d.deal_value.toLocaleString()})` : ""}`
    ),
    `\nMEETINGS HELD: ${meetings.length}`,
    `MEETINGS WITH OUTCOMES LOGGED: ${meetings.filter((m) => m.outcome).length}`,
    `\nTEAM COMPLETIONS:`,
    ...team.map((m: any) => {
      const count = teamWorkload[m.user_id] || 0
      return `- ${m.profile?.full_name} (${m.position}): ${count} tasks`
    }),
  ].filter(Boolean)

  const groq = getGroqClient()
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      {
        role: "system",
        content: `You are writing a concise weekly review for a founder. Highlight wins, flag what slipped, give 2-3 specific action items for the coming week. Be direct, use emojis, max 250 words.`,
      },
      {
        role: "user",
        content: `Write the weekly review:\n\n${contextLines.join("\n")}`,
      },
    ],
    max_tokens: 500,
    temperature: 0.6,
  })

  const content = completion.choices[0]?.message?.content
  if (!content) return null

  return `📊 **Weekly Review — ${weekStart} to ${weekEndStr}**\n\n${content}`
}

export async function GET(request: Request) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const founders = await getAllFounders()
  const results = { sent: 0, failed: 0 }

  for (const founderId of founders) {
    try {
      const review = await buildWeeklyReviewForFounder(founderId)
      if (review) {
        await sendAIMessage(founderId, review)
        results.sent++
      }
    } catch (err) {
      console.error(`[CRON:weekly-review] Failed for ${founderId}:`, err)
      results.failed++
    }
  }

  return NextResponse.json({ ok: true, ...results })
}