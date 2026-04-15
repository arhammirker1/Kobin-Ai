// Called by cron (Vercel Cron / external) or internal triggers
// POST /api/ai/proactive
// Body: { type: "morning_brief" | "eod_summary" | "risk_alert", founder_id?: string }

import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { sendMorningBrief, sendEODSummary, sendRiskAlert } from "@/lib/ai/proactive"
import { analyzeWorkspace } from "@/lib/ai/intelligence"
import { NextResponse } from "next/server"

// Secret header to prevent unauthorized calls
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET

export async function POST(req: Request) {
  // Allow internal calls with secret OR authenticated user calls
  const secret = req.headers.get("x-internal-secret")
  const isInternal = secret === INTERNAL_SECRET

  if (!isInternal) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { type, founder_id } = await req.json()

  // If no founder_id, run for all active founders
  let founderIds: string[] = []

  if (founder_id) {
    founderIds = [founder_id]
  } else if (isInternal) {
    // Fetch all founder IDs
    const { data: founders } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_type", "founder")
    founderIds = founders?.map(f => f.id) || []
  } else {
    // Authenticated user — use their own ID
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) founderIds = [user.id]
  }

  const results: Array<{ founder_id: string; status: string }> = []

  for (const fid of founderIds) {
    try {
      // ── Plan enforcement — check if this founder's plan supports this type ──
      const { resolvePlanContext } = await import("@/lib/plan-guard")
      const planCtx = await resolvePlanContext(fid)

      switch (type) {
        case "morning_brief":
          if (!planCtx.limits.ai_proactive_briefings) {
            results.push({ founder_id: fid, status: "skipped_plan" })
            continue
          }
          await sendMorningBrief(fid)
          break
        case "eod_summary":
          if (!planCtx.limits.ai_proactive_briefings) {
            results.push({ founder_id: fid, status: "skipped_plan" })
            continue
          }
          await sendEODSummary(fid)
          break
        case "risk_alert": {
          if (!planCtx.limits.ai_proactive_risk_alerts) {
            results.push({ founder_id: fid, status: "skipped_plan" })
            continue
          }
          const intel = await analyzeWorkspace(fid)
          const criticalRisks = intel.risks.filter(r => r.severity === "critical")
          if (criticalRisks.length > 0) {
            const summary = criticalRisks.slice(0, 3).map(r => `• ${r.title}: ${r.detail}`).join("\n")
            await sendRiskAlert(fid, summary)
          }
          break
        }
        default:
          return NextResponse.json({ error: "Unknown type" }, { status: 400 })
      }
      results.push({ founder_id: fid, status: "ok" })
    } catch (err) {
      console.error(`[proactive] failed for ${fid}:`, err)
      results.push({ founder_id: fid, status: "error" })
    }
  }

  return NextResponse.json({ results })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const hour = new Date().getHours()
  const type = hour < 12 ? "morning_brief" : "eod_summary"

  // Only run if called from Vercel cron (no auth needed, internal only)
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: founders } = await supabaseAdmin
    .from("profiles").select("id").eq("user_type", "founder")

  for (const f of founders || []) {
    try {
      // Check plan before sending proactive messages
      const { resolvePlanContext } = await import("@/lib/plan-guard")
      const planCtx = await resolvePlanContext(f.id)
      if (type === "morning_brief" && !planCtx.limits.ai_proactive_briefings) continue
      if (type === "eod_summary" && !planCtx.limits.ai_proactive_briefings) continue

      if (type === "morning_brief") await sendMorningBrief(f.id)
      else await sendEODSummary(f.id)
    } catch (err) {
      console.error(`[cron] failed for ${f.id}:`, err)
    }
  }

  return NextResponse.json({ ok: true, type })
}