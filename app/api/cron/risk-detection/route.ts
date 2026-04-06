import { supabaseAdmin } from "@/lib/supabase/admin"
import { sendAIMessage, getAllFounders } from "@/lib/ai/inbox-dm"
import { NextResponse } from "next/server"

export const maxDuration = 300

function verifyCron(request: Request): boolean {
  const ua = request.headers.get("user-agent") || ""
  const auth = request.headers.get("authorization") || ""
  return ua.includes("vercel-cron") || auth === `Bearer ${process.env.CRON_SECRET}`
}

async function detectRisksForFounder(founderId: string): Promise<string | null> {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000)
  const twentyOneDaysAgo = new Date(now.getTime() - 21 * 86400000)

  const [overdueRes, blockedRes, staleDealsRes, teamRes, projectsRes] = await Promise.all([
    // Critical: overdue urgent/high tasks
    supabaseAdmin
      .from("tasks")
      .select("title, priority, due_date, assigned_to")
      .eq("user_id", founderId)
      .eq("is_completed", false)
      .in("priority", ["urgent", "high"])
      .lt("due_date", now.toISOString())
      .not("due_date", "is", null)
      .limit(10),

    // Blocked tasks older than 3 days
    supabaseAdmin
      .from("tasks")
      .select("title, created_at")
      .eq("user_id", founderId)
      .eq("status", "blocked")
      .eq("is_completed", false)
      .limit(10),

    // Deals stuck in key stages for 21+ days
    supabaseAdmin
      .from("relationships")
      .select("full_name, company, pipeline_stage, deal_value, stage_entered_at")
      .eq("user_id", founderId)
      .eq("status", "active")
      .in("pipeline_stage", ["proposal", "negotiating", "meeting_booked"])
      .lt("stage_entered_at", twentyOneDaysAgo.toISOString())
      .limit(5),

    // Team members with 0 completed tasks in 7 days
    supabaseAdmin
      .from("team_members")
      .select("user_id, position, profile:profiles!team_members_user_id_profiles_fkey(full_name)")
      .eq("founder_id", founderId)
      .eq("is_active", true),

    // Projects with no task activity in 7 days
    supabaseAdmin
      .from("projects")
      .select("id, name, status")
      .eq("founder_id", founderId)
      .eq("status", "active"),
  ])

  const risks: string[] = []

  const overdueCritical = overdueRes.data || []
  if (overdueCritical.length > 0) {
    risks.push(
      `🚨 **${overdueCritical.length} critical task${overdueCritical.length > 1 ? "s" : ""} overdue**:\n` +
        overdueCritical
          .map((t) => {
            const days = t.due_date
              ? Math.floor((now.getTime() - new Date(t.due_date).getTime()) / 86400000)
              : 0
            return `  • ${t.title} (${days}d overdue, ${t.priority})`
          })
          .join("\n")
    )
  }

  const blocked = blockedRes.data || []
  if (blocked.length > 0) {
    risks.push(
      `⛔ **${blocked.length} blocked task${blocked.length > 1 ? "s" : ""} need attention**:\n` +
        blocked.map((t) => `  • ${t.title}`).join("\n")
    )
  }

  const staleDeals = staleDealsRes.data || []
  if (staleDeals.length > 0) {
    risks.push(
      `💸 **${staleDeals.length} deal${staleDeals.length > 1 ? "s" : ""} stuck 21+ days** — risk of going cold:\n` +
        staleDeals
          .map((d) => {
            const days = d.stage_entered_at
              ? Math.floor((now.getTime() - new Date(d.stage_entered_at).getTime()) / 86400000)
              : 0
            const stage = d.pipeline_stage.replace(/_/g, " ")
            return `  • ${d.full_name}${d.company ? ` (${d.company})` : ""} — ${stage} for ${days} days${d.deal_value ? `, $${d.deal_value.toLocaleString()}` : ""}`
          })
          .join("\n")
    )
  }

  if (risks.length === 0) return null

  const hour = now.getUTCHours()
  const session = hour < 12 ? "morning" : "afternoon"
  const header = `⚠️ **Risk Alert** — ${session} check-in\n\n`

  return (
    header +
    risks.join("\n\n") +
    `\n\n_Reply in the AI Command Bar with "fix [task name]" to take action._`
  )
}

export async function GET(request: Request) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const founders = await getAllFounders()
  const results = { sent: 0, skipped: 0, failed: 0 }

  for (const founderId of founders) {
    try {
      const message = await detectRisksForFounder(founderId)
      if (message) {
        await sendAIMessage(founderId, message)
        results.sent++
      } else {
        results.skipped++
      }
    } catch (err) {
      console.error(`[CRON:risk-detection] Failed for ${founderId}:`, err)
      results.failed++
    }
  }

  return NextResponse.json({ ok: true, ...results })
}