import { supabaseAdmin } from "@/lib/supabase/admin"
import { sendAIMessage, getAllFounders } from "@/lib/ai/inbox-dm"
import { NextResponse } from "next/server"

export const maxDuration = 300

function verifyCron(request: Request): boolean {
  const ua = request.headers.get("user-agent") || ""
  const auth = request.headers.get("authorization") || ""
  return ua.includes("vercel-cron") || auth === `Bearer ${process.env.CRON_SECRET}`
}

async function buildRevenueIntelligenceForFounder(founderId: string): Promise<string | null> {
  const now = new Date()
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000)
  const threeDaysFromNow = new Date(now.getTime() + 3 * 86400000)

  const [closingRes, highProbRes, newLeadsRes, staleHighRes] = await Promise.all([
    // Deals with expected close date in next 7 days
    supabaseAdmin
      .from("relationships")
      .select("full_name, company, pipeline_stage, deal_value, expected_close_date, close_probability")
      .eq("user_id", founderId)
      .eq("status", "active")
      .not("pipeline_stage", "in", '("closed_won","closed_lost")')
      .not("expected_close_date", "is", null)
      .lte("expected_close_date", sevenDaysFromNow.toISOString().split("T")[0])
      .gte("expected_close_date", now.toISOString().split("T")[0])
      .order("expected_close_date", { ascending: true }),

    // High probability deals (>70%) needing action
    supabaseAdmin
      .from("relationships")
      .select("full_name, company, pipeline_stage, deal_value, close_probability, stage_entered_at")
      .eq("user_id", founderId)
      .eq("status", "active")
      .not("pipeline_stage", "in", '("closed_won","closed_lost")')
      .gte("close_probability", 70)
      .order("deal_value", { ascending: false })
      .limit(5),

    // New leads in last 3 days not yet contacted
    supabaseAdmin
      .from("relationships")
      .select("full_name, company, created_at")
      .eq("user_id", founderId)
      .eq("status", "active")
      .eq("pipeline_stage", "new_lead")
      .gte("created_at", threeDaysFromNow.toISOString())
      .limit(5),

    // High-value deals stale 14+ days
    supabaseAdmin
      .from("relationships")
      .select("full_name, company, pipeline_stage, deal_value, stage_entered_at")
      .eq("user_id", founderId)
      .eq("status", "active")
      .not("pipeline_stage", "in", '("closed_won","closed_lost","new_lead")')
      .not("deal_value", "is", null)
      .gte("deal_value", 5000)
      .lt("stage_entered_at", fourteenDaysAgo.toISOString())
      .order("deal_value", { ascending: false })
      .limit(5),
  ])

  const closing = closingRes.data || []
  const highProb = highProbRes.data || []
  const staleHigh = staleHighRes.data || []

  const insights: string[] = []

  if (closing.length > 0) {
    const totalValue = closing.reduce((s, d) => s + (d.deal_value || 0), 0)
    insights.push(
      `🎯 **${closing.length} deal${closing.length > 1 ? "s" : ""} closing this week** — $${totalValue.toLocaleString()} at stake:\n` +
        closing
          .map((d) => {
            const closeDate = d.expected_close_date
              ? new Date(d.expected_close_date).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })
              : "TBD"
            return `  • ${d.full_name}${d.company ? ` (${d.company})` : ""} — closes ${closeDate}${d.deal_value ? `, $${d.deal_value.toLocaleString()}` : ""}${d.close_probability ? ` (${d.close_probability}%)` : ""}`
          })
          .join("\n")
    )
  }

  if (highProb.length > 0) {
    const totalWeighted = highProb.reduce((s, d) => {
      return s + ((d.deal_value || 0) * (d.close_probability || 0)) / 100
    }, 0)
    insights.push(
      `💰 **${highProb.length} high-probability deal${highProb.length > 1 ? "s"  : ""}** — ~$${Math.round(totalWeighted).toLocaleString()} weighted revenue:\n` +
        highProb
          .map((d) => {
            const stage = d.pipeline_stage.replace(/_/g, " ")
            return `  • ${d.full_name}${d.company ? ` (${d.company})` : ""} — ${stage}, ${d.close_probability}%${d.deal_value ? `, $${d.deal_value.toLocaleString()}` : ""}`
          })
          .join("\n")
    )
  }

  if (staleHigh.length > 0) {
    insights.push(
      `⚠️ **${staleHigh.length} high-value deal${staleHigh.length > 1 ? "s" : ""} going cold:**\n` +
        staleHigh
          .map((d) => {
            const days = d.stage_entered_at
              ? Math.floor((now.getTime() - new Date(d.stage_entered_at).getTime()) / 86400000)
              : 0
            const stage = d.pipeline_stage.replace(/_/g, " ")
            return `  • ${d.full_name}${d.company ? ` (${d.company})` : ""} — ${stage} for ${days} days, $${(d.deal_value || 0).toLocaleString()}`
          })
          .join("\n")
    )
  }

  if (insights.length === 0) return null

  return (
    `💼 **Revenue Intelligence** — ${now.toLocaleDateString("en-US", { weekday: "long" })}\n\n` +
    insights.join("\n\n") +
    `\n\n_Use the AI Command Bar: "move [name] to closed won" or "schedule follow-up with [name]"_`
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
      const message = await buildRevenueIntelligenceForFounder(founderId)
      if (message) {
        await sendAIMessage(founderId, message)
        results.sent++
      } else {
        results.skipped++
      }
    } catch (err) {
      console.error(`[CRON:revenue-intelligence] Failed for ${founderId}:`, err)
      results.failed++
    }
  }

  return NextResponse.json({ ok: true, ...results })
}