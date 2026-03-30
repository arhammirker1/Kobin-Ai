// ── Lead Scoring Engine ──────────────────────────────────────────────────────
// Computes a 0-100 lead score based on email analysis data.
// Updates relationships table with score and status (cold/warm/hot).

import { supabaseAdmin } from "@/lib/supabase/admin"
import type { EmailIntent } from "./email-intelligence"

// ── Types ───────────────────────────────────────────────────────────────────

export interface LeadScoreResult {
  score: number             // 0–100
  status: "cold" | "warm" | "hot"
  breakdown: ScoreBreakdown
}

export interface ScoreBreakdown {
  sentiment_score: number
  intent_score: number
  engagement_score: number
  recency_penalty: number
  total_emails: number
  inbound_count: number
  outbound_count: number
}

// ── Scoring Weights ─────────────────────────────────────────────────────────

const INTENT_SCORES: Record<string, number> = {
  meeting_intent: 30,
  interested: 25,
  pricing_inquiry: 20,
  request_info: 15,
  neutral: 5,
  objection: -5,
  not_interested: -15,
  spam: -20,
}

const SENTIMENT_SCORES: Record<string, number> = {
  positive: 20,
  neutral: 5,
  negative: -10,
}

// ── Main Scoring Function ───────────────────────────────────────────────────

export async function computeLeadScore(
  contactId: string,
  userId: string
): Promise<LeadScoreResult> {
  // Fetch all analyses for this contact
  const { data: analyses, error } = await supabaseAdmin
    .from("email_analyses")
    .select("intent, intent_confidence, sentiment, direction, analyzed_at")
    .eq("contact_id", contactId)
    .eq("user_id", userId)
    .order("analyzed_at", { ascending: false })
    .limit(50)

  if (error || !analyses || analyses.length === 0) {
    return {
      score: 0,
      status: "cold",
      breakdown: {
        sentiment_score: 0,
        intent_score: 0,
        engagement_score: 0,
        recency_penalty: 0,
        total_emails: 0,
        inbound_count: 0,
        outbound_count: 0,
      },
    }
  }

  const inbound = analyses.filter((a) => a.direction === "inbound")
  const outbound = analyses.filter((a) => a.direction === "outbound")

  // 1. Intent score — weighted by confidence, recent emails count more
  let intentScore = 0
  for (let i = 0; i < inbound.length; i++) {
    const a = inbound[i]
    const recencyWeight = Math.max(0.3, 1 - i * 0.1) // Recent emails weighted more
    const baseScore = INTENT_SCORES[a.intent] || 0
    const confidenceWeight = (a.intent_confidence || 50) / 100
    intentScore += baseScore * confidenceWeight * recencyWeight
  }
  // Normalize to 0–40 range
  intentScore = Math.min(40, Math.max(0, intentScore))

  // 2. Sentiment score — average across inbound emails
  let sentimentScore = 0
  for (const a of inbound) {
    sentimentScore += SENTIMENT_SCORES[a.sentiment] || 0
  }
  if (inbound.length > 0) sentimentScore /= inbound.length
  sentimentScore = Math.min(25, Math.max(-10, sentimentScore))

  // 3. Engagement score — based on reply patterns
  const replyRatio = inbound.length > 0 && outbound.length > 0
    ? Math.min(inbound.length / outbound.length, 2) // Cap at 2:1
    : 0
  const engagementScore = Math.min(20, Math.round(replyRatio * 10))

  // 4. Recency penalty — days since last inbound email
  let recencyPenalty = 0
  if (inbound.length > 0) {
    const lastInbound = new Date(inbound[0].analyzed_at)
    const daysSince = Math.floor(
      (Date.now() - lastInbound.getTime()) / (1000 * 60 * 60 * 24)
    )
    recencyPenalty = Math.min(15, daysSince * 2) // -2 per day, max -15
  } else {
    recencyPenalty = 15 // No inbound emails = max penalty
  }

  // Calculate total
  const rawScore = Math.round(intentScore + sentimentScore + engagementScore - recencyPenalty)
  const score = Math.min(100, Math.max(0, rawScore))

  // Determine status
  const status: "cold" | "warm" | "hot" =
    score >= 60 ? "hot" : score >= 30 ? "warm" : "cold"

  return {
    score,
    status,
    breakdown: {
      sentiment_score: Math.round(sentimentScore),
      intent_score: Math.round(intentScore),
      engagement_score: engagementScore,
      recency_penalty: recencyPenalty,
      total_emails: analyses.length,
      inbound_count: inbound.length,
      outbound_count: outbound.length,
    },
  }
}

// ── Persist Score to DB ─────────────────────────────────────────────────────

export async function updateContactScore(
  contactId: string,
  userId: string,
  result: LeadScoreResult
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("relationships")
    .update({
      lead_score: result.score,
      lead_status: result.status,
      score_updated_at: new Date().toISOString(),
    })
    .eq("id", contactId)
    .eq("user_id", userId)

  if (error) {
    console.error("[LeadScoring] Failed to update score:", error)
  }
}

// ── Score + Persist in one call ─────────────────────────────────────────────

export async function scoreAndPersist(
  contactId: string,
  userId: string
): Promise<LeadScoreResult> {
  const result = await computeLeadScore(contactId, userId)
  await updateContactScore(contactId, userId, result)
  return result
}
