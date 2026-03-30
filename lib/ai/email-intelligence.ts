// ── Email Intelligence Engine ────────────────────────────────────────────────
// Analyzes email content for intent, sentiment, and key signals using Groq AI.
// Returns structured JSON that gets stored in email_analyses table.

import { getGroqClient, GROQ_MODEL } from "./groq"

// ── Types ───────────────────────────────────────────────────────────────────

export interface EmailAnalysis {
  intent: EmailIntent
  intent_confidence: number
  sentiment: "positive" | "neutral" | "negative"
  signals: string[]
  reasoning: string
}

export type EmailIntent =
  | "interested"
  | "not_interested"
  | "neutral"
  | "request_info"
  | "pricing_inquiry"
  | "meeting_intent"
  | "objection"
  | "spam"

// ── The Analysis Prompt ─────────────────────────────────────────────────────

const ANALYSIS_PROMPT = `You are an expert sales intelligence analyst. Analyze the following email and return structured insights.

CLASSIFY the email into exactly one intent:
- interested: Shows clear interest in the product/service/partnership
- not_interested: Explicit rejection or disinterest
- neutral: Informational, no clear buying signal or rejection
- request_info: Asking for more details, specs, or documentation
- pricing_inquiry: Asking about pricing, costs, packages, or quotes
- meeting_intent: Wants to schedule a call, demo, or meeting
- objection: Raises concerns, pushback, or blockers
- spam: Irrelevant, automated, or marketing noise

DETECT sentiment: positive, neutral, or negative

EXTRACT key signals (short phrases):
- Budget mentions ("budget of $50k", "cost concern")
- Timeline mentions ("need by Q2", "urgent timeline")
- Buying signals ("ready to move forward", "interested in demo")
- Objections ("too expensive", "need to check with team")
- Decision-maker signals ("I'll discuss with CEO", "final authority")

Return ONLY valid JSON in this exact format:
{
  "intent": "one_of_the_intents_above",
  "intent_confidence": 0-100,
  "sentiment": "positive|neutral|negative",
  "signals": ["signal 1", "signal 2"],
  "reasoning": "One sentence explaining the classification"
}`

// ── Main Analysis Function ──────────────────────────────────────────────────

export async function analyzeEmail(
  emailBody: string,
  direction: "inbound" | "outbound",
  subject?: string
): Promise<EmailAnalysis> {
  const groq = getGroqClient()

  const contextPrefix = direction === "outbound"
    ? "This is an OUTBOUND email (sent by the user to a contact)."
    : "This is an INBOUND email (received from a contact)."

  const emailContent = [
    subject ? `Subject: ${subject}` : "",
    `Body:\n${emailBody.slice(0, 2000)}`, // Cap at 2000 chars to control costs
  ]
    .filter(Boolean)
    .join("\n")

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: ANALYSIS_PROMPT },
        {
          role: "user",
          content: `${contextPrefix}\n\n${emailContent}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: "json_object" },
    })

    const raw = completion.choices?.[0]?.message?.content || ""
    return parseAnalysisResponse(raw)
  } catch (error) {
    console.error("[EmailIntel] Analysis failed:", error)
    // Return safe fallback instead of throwing
    return {
      intent: "neutral",
      intent_confidence: 0,
      sentiment: "neutral",
      signals: [],
      reasoning: "Analysis failed — could not reach AI service",
    }
  }
}

// ── Response Parser (with fallbacks) ────────────────────────────────────────

function parseAnalysisResponse(raw: string): EmailAnalysis {
  try {
    const parsed = JSON.parse(raw)

    // Validate intent
    const validIntents: EmailIntent[] = [
      "interested", "not_interested", "neutral", "request_info",
      "pricing_inquiry", "meeting_intent", "objection", "spam",
    ]
    const intent = validIntents.includes(parsed.intent) ? parsed.intent : "neutral"

    // Validate confidence
    const confidence = typeof parsed.intent_confidence === "number"
      ? Math.min(100, Math.max(0, Math.round(parsed.intent_confidence)))
      : 50

    // Validate sentiment
    const validSentiments = ["positive", "neutral", "negative"] as const
    const sentiment = validSentiments.includes(parsed.sentiment)
      ? parsed.sentiment
      : "neutral"

    // Validate signals
    const signals = Array.isArray(parsed.signals)
      ? parsed.signals.filter((s: unknown) => typeof s === "string").slice(0, 10)
      : []

    // Reasoning
    const reasoning = typeof parsed.reasoning === "string"
      ? parsed.reasoning.slice(0, 200)
      : "No reasoning provided"

    return { intent, intent_confidence: confidence, sentiment, signals, reasoning }
  } catch {
    console.error("[EmailIntel] Failed to parse AI response:", raw)
    return {
      intent: "neutral",
      intent_confidence: 0,
      sentiment: "neutral",
      signals: [],
      reasoning: "Failed to parse AI response",
    }
  }
}

// ── Batch Analysis (for thread-level processing) ────────────────────────────

export interface ThreadAnalysisSummary {
  dominant_intent: EmailIntent
  overall_sentiment: "positive" | "neutral" | "negative"
  all_signals: string[]
  message_count: number
  summary: string
}

export function summarizeThreadAnalyses(
  analyses: EmailAnalysis[]
): ThreadAnalysisSummary {
  if (analyses.length === 0) {
    return {
      dominant_intent: "neutral",
      overall_sentiment: "neutral",
      all_signals: [],
      message_count: 0,
      summary: "No emails analyzed yet",
    }
  }

  // Find dominant intent (highest confidence, preferring non-neutral)
  const intentCounts: Record<string, { count: number; totalConf: number }> = {}
  for (const a of analyses) {
    if (!intentCounts[a.intent]) intentCounts[a.intent] = { count: 0, totalConf: 0 }
    intentCounts[a.intent].count++
    intentCounts[a.intent].totalConf += a.intent_confidence
  }

  // Prioritize non-neutral intents
  const sortedIntents = Object.entries(intentCounts)
    .sort(([aKey, a], [bKey, b]) => {
      // Non-neutral beats neutral
      if (aKey === "neutral" && bKey !== "neutral") return 1
      if (bKey === "neutral" && aKey !== "neutral") return -1
      // Higher count wins, then higher avg confidence
      if (b.count !== a.count) return b.count - a.count
      return (b.totalConf / b.count) - (a.totalConf / a.count)
    })

  const dominant_intent = (sortedIntents[0]?.[0] || "neutral") as EmailIntent

  // Overall sentiment (weighted by confidence)
  const sentimentScores = { positive: 0, neutral: 0, negative: 0 }
  for (const a of analyses) {
    sentimentScores[a.sentiment] += a.intent_confidence
  }
  const overall_sentiment = (
    Object.entries(sentimentScores).sort(([, a], [, b]) => b - a)[0][0]
  ) as "positive" | "neutral" | "negative"

  // Deduplicate signals
  const all_signals = [...new Set(analyses.flatMap((a) => a.signals))]

  // Build summary
  const intentLabel = dominant_intent.replace(/_/g, " ")
  const summary = `Thread shows **${intentLabel}** with **${overall_sentiment}** sentiment across ${analyses.length} messages.${
    all_signals.length > 0 ? ` Key signals: ${all_signals.slice(0, 3).join(", ")}` : ""
  }`

  return {
    dominant_intent,
    overall_sentiment,
    all_signals,
    message_count: analyses.length,
    summary,
  }
}
