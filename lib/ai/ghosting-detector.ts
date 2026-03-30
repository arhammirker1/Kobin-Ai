// ── Ghosting Detector ────────────────────────────────────────────────────────
// Detects when leads stop responding and updates their ghosting status.
// Works by checking email_analyses for inbound/outbound patterns.

import { supabaseAdmin } from "@/lib/supabase/admin"

// ── Types ───────────────────────────────────────────────────────────────────

export interface GhostingResult {
  is_ghosting: boolean
  ghosting_days: number
  last_inbound_at: string | null
  last_outbound_at: string | null
  suggestion: string | null // AI-informed suggestion
}

// ── Config ──────────────────────────────────────────────────────────────────

const GHOSTING_THRESHOLD_DAYS = 3 // Mark as ghosting after 3 days no reply

// ── Main Detection Function ─────────────────────────────────────────────────

export async function detectGhosting(
  contactId: string,
  userId: string
): Promise<GhostingResult> {
  // Get latest inbound and outbound emails
  const [inboundRes, outboundRes] = await Promise.all([
    supabaseAdmin
      .from("email_analyses")
      .select("analyzed_at")
      .eq("contact_id", contactId)
      .eq("user_id", userId)
      .eq("direction", "inbound")
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("email_analyses")
      .select("analyzed_at")
      .eq("contact_id", contactId)
      .eq("user_id", userId)
      .eq("direction", "outbound")
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const lastInbound = inboundRes.data?.analyzed_at || null
  const lastOutbound = outboundRes.data?.analyzed_at || null

  // No emails at all — not ghosting, just no activity
  if (!lastInbound && !lastOutbound) {
    return {
      is_ghosting: false,
      ghosting_days: 0,
      last_inbound_at: null,
      last_outbound_at: null,
      suggestion: null,
    }
  }

  // Calculate ghosting
  const now = Date.now()
  let is_ghosting = false
  let ghosting_days = 0

  if (lastOutbound && (!lastInbound || new Date(lastOutbound) > new Date(lastInbound))) {
    // Last action was outbound — check how long since our message
    const daysSinceOutbound = Math.floor(
      (now - new Date(lastOutbound).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysSinceOutbound >= GHOSTING_THRESHOLD_DAYS) {
      is_ghosting = true
      ghosting_days = daysSinceOutbound
    }
  } else if (lastInbound) {
    // Last action was inbound — they replied, no ghosting
    is_ghosting = false
    ghosting_days = 0
  }

  // Generate suggestion based on ghosting duration
  let suggestion: string | null = null
  if (is_ghosting) {
    if (ghosting_days <= 5) {
      suggestion = "Send a gentle follow-up — reference your last message"
    } else if (ghosting_days <= 10) {
      suggestion = "Try a value-add approach — share a relevant resource or insight"
    } else if (ghosting_days <= 20) {
      suggestion = "Send a break-up email — polite final check-in"
    } else {
      suggestion = "Consider archiving — lead may have gone cold"
    }
  }

  return {
    is_ghosting,
    ghosting_days,
    last_inbound_at: lastInbound,
    last_outbound_at: lastOutbound,
    suggestion,
  }
}

// ── Persist Ghosting Status ─────────────────────────────────────────────────

export async function updateGhostingStatus(
  contactId: string,
  userId: string,
  result: GhostingResult
): Promise<void> {
  const updateData: Record<string, any> = {
    is_ghosting: result.is_ghosting,
    ghosting_days: result.ghosting_days,
  }

  if (result.last_inbound_at) {
    updateData.last_inbound_at = result.last_inbound_at
  }
  if (result.last_outbound_at) {
    updateData.last_outbound_at = result.last_outbound_at
  }

  const { error } = await supabaseAdmin
    .from("relationships")
    .update(updateData)
    .eq("id", contactId)
    .eq("user_id", userId)

  if (error) {
    console.error("[Ghosting] Failed to update status:", error)
  }
}

// ── Detect + Persist in one call ────────────────────────────────────────────

export async function detectAndPersist(
  contactId: string,
  userId: string
): Promise<GhostingResult> {
  const result = await detectGhosting(contactId, userId)
  await updateGhostingStatus(contactId, userId, result)
  return result
}
