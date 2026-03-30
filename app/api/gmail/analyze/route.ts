import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshGoogleToken } from "@/lib/google/token"
import { analyzeEmail } from "@/lib/ai/email-intelligence"
import { scoreAndPersist } from "@/lib/ai/lead-scoring"
import { detectAndPersist } from "@/lib/ai/ghosting-detector"
import { NextResponse } from "next/server"

// POST /api/gmail/analyze
// Analyzes all unanalyzed messages in a Gmail thread.
// Uses cache-first approach: if all messages are already analyzed,
// returns cached data instantly without calling Gmail API or AI.
// Tracks processed message count (including skipped short messages)
// so the cache check is reliable across reloads.

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { threadId, messageCount } = await request.json()
    if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 })

    // ─── STEP 1: Check cache first ──────────────────────────────────────
    // Query all analyses for this thread including "skipped" placeholder rows.
    // We also store the total processed message count as a thread-level marker
    // (a row with gmail_message_id = '__thread_meta__') to handle skipped messages.
    const { data: cachedRows } = await supabaseAdmin
      .from("email_analyses")
      .select("gmail_message_id, intent, intent_confidence, sentiment, signals, reasoning, direction, contact_id")
      .eq("user_id", user.id)
      .eq("gmail_thread_id", threadId)
      .order("analyzed_at", { ascending: true })

    // Separate the thread meta marker from actual analyses
    const threadMeta = cachedRows?.find(r => r.gmail_message_id === `__thread_meta_${threadId}__`)
    const cachedAnalyses = cachedRows?.filter(r => !r.gmail_message_id.startsWith("__thread_meta_")) || []
    const lastProcessedCount = threadMeta ? (threadMeta.intent_confidence || 0) : 0

    // If we've processed this exact message count before, return cached data
    // without calling Gmail API or AI — true cache hit
    if (lastProcessedCount > 0 && messageCount && lastProcessedCount >= messageCount) {
      return NextResponse.json({
        analyses: buildAnalysisMap(cachedAnalyses),
        thread_summary: buildThreadSummary(cachedAnalyses),
        contact_scores: await getCachedScores(cachedAnalyses, user.id),
        analyzed_count: 0,
        cached: true,
      })
    }

    // ─── STEP 2: Need fresh analysis — fetch from Gmail ─────────────────
    const { data: integration } = await supabaseAdmin
      .from("google_integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_connected", true)
      .single()

    if (!integration) {
      return NextResponse.json({ error: "Gmail not connected" }, { status: 400 })
    }

    const accessToken = await refreshGoogleToken(integration)
    const userEmail = integration.google_email?.toLowerCase() || ""

    const threadRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!threadRes.ok) {
      return NextResponse.json({ error: "Failed to fetch thread" }, { status: 500 })
    }

    const threadData = await threadRes.json()
    const messages = threadData.messages || []

    if (messages.length === 0) {
      return NextResponse.json({ analyses: {}, thread_summary: null })
    }

    // ─── STEP 3: Find unanalyzed messages ───────────────────────────────
    const analyzedIds = new Set(cachedAnalyses.map((a) => a.gmail_message_id))

    // If all messages already analyzed, return cached (race condition safety)
    const unanalyzedMessages = messages.filter((m: any) => !analyzedIds.has(m.id))
    if (unanalyzedMessages.length === 0) {
      // Update the thread meta marker with the current message count
      await upsertThreadMeta(user.id, threadId, messages.length)
      return NextResponse.json({
        analyses: buildAnalysisMap(cachedAnalyses),
        thread_summary: buildThreadSummary(cachedAnalyses),
        contact_scores: await getCachedScores(cachedAnalyses, user.id),
        analyzed_count: 0,
        cached: true,
      })
    }

    // ─── STEP 4: Analyze ONLY new messages ──────────────────────────────
    const newAnalyses: Array<Record<string, any>> = []

    for (const msg of unanalyzedMessages) {
      const body = extractBody(msg)
      const fromHeader = getHeader(msg, "From")
      const subject = getHeader(msg, "Subject")
      const senderEmail = extractEmail(fromHeader)
      const isOutbound = senderEmail.toLowerCase() === userEmail
      const direction = isOutbound ? "outbound" : "inbound"

      // Skip very short or empty bodies
      if (!body || body.trim().length < 10) continue

      // Run AI analysis
      const analysis = await analyzeEmail(body, direction, subject)

      // Find matching contact
      const contactEmail = isOutbound
        ? extractEmail(getHeader(msg, "To"))
        : senderEmail

      const { data: contact } = await supabaseAdmin
        .from("relationships")
        .select("id")
        .eq("user_id", user.id)
        .ilike("email", contactEmail)
        .maybeSingle()

      newAnalyses.push({
        user_id: user.id,
        gmail_message_id: msg.id,
        gmail_thread_id: threadId,
        contact_id: contact?.id || null,
        sender_email: senderEmail.toLowerCase(),
        direction,
        intent: analysis.intent,
        intent_confidence: analysis.intent_confidence,
        sentiment: analysis.sentiment,
        signals: analysis.signals,
        reasoning: analysis.reasoning,
      })
    }

    // ─── STEP 5: Insert new analyses ────────────────────────────────────
    if (newAnalyses.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("email_analyses")
        .upsert(newAnalyses, { onConflict: "user_id,gmail_message_id" })

      if (insertError) {
        console.error("[Analyze] Insert error:", insertError)
      }
    }

    // ─── STEP 5b: Update thread meta with total processed count ─────────
    // This tracks how many messages we've seen (including skipped short ones)
    // so the cache check works correctly on reload
    await upsertThreadMeta(user.id, threadId, messages.length)

    // ─── STEP 6: Get complete analysis set ──────────────────────────────
    const { data: rawAllAnalyses } = await supabaseAdmin
      .from("email_analyses")
      .select("gmail_message_id, intent, intent_confidence, sentiment, signals, reasoning, direction, contact_id")
      .eq("user_id", user.id)
      .eq("gmail_thread_id", threadId)
      .order("analyzed_at", { ascending: true })

    // Filter out thread meta marker rows
    const allAnalyses = (rawAllAnalyses || []).filter(
      (a) => !a.gmail_message_id.startsWith("__thread_meta_")
    )

    // ─── STEP 7: Only re-score if we added NEW analyses ─────────────────
    const scoreResults: Record<string, any> = {}
    if (newAnalyses.length > 0) {
      const contactIds = [...new Set(
        allAnalyses
          .map((a) => a.contact_id)
          .filter(Boolean)
      )] as string[]

      for (const cid of contactIds) {
        const [scoreResult, ghostingResult] = await Promise.all([
          scoreAndPersist(cid, user.id),
          detectAndPersist(cid, user.id),
        ])
        scoreResults[cid] = { score: scoreResult, ghosting: ghostingResult }
      }
    } else {
      // No new analyses — just read cached scores
      Object.assign(scoreResults, await getCachedScores(allAnalyses, user.id))
    }

    return NextResponse.json({
      analyses: buildAnalysisMap(allAnalyses),
      thread_summary: buildThreadSummary(allAnalyses),
      contact_scores: scoreResults,
      analyzed_count: newAnalyses.length,
      cached: false,
    })
  } catch (err) {
    console.error("[Analyze] Error:", err)
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── Response builders ───────────────────────────────────────────────────────

function buildAnalysisMap(analyses: any[]): Record<string, any> {
  const map: Record<string, any> = {}
  for (const a of analyses) {
    map[a.gmail_message_id] = {
      intent: a.intent,
      intent_confidence: a.intent_confidence,
      sentiment: a.sentiment,
      signals: a.signals,
      reasoning: a.reasoning,
      direction: a.direction,
    }
  }
  return map
}

function buildThreadSummary(analyses: any[]) {
  const inbound = analyses.filter((a) => a.direction === "inbound")
  if (inbound.length === 0) return null

  const { summarizeThreadAnalyses } = require("@/lib/ai/email-intelligence")
  return summarizeThreadAnalyses(
    inbound.map((a) => ({
      intent: a.intent,
      intent_confidence: a.intent_confidence,
      sentiment: a.sentiment,
      signals: a.signals || [],
      reasoning: a.reasoning || "",
    }))
  )
}

async function getCachedScores(analyses: any[], userId: string): Promise<Record<string, any>> {
  const contactIds = [...new Set(
    analyses.map((a) => a.contact_id).filter(Boolean)
  )] as string[]

  if (contactIds.length === 0) return {}

  const results: Record<string, any> = {}
  for (const cid of contactIds) {
    const { data: contact } = await supabaseAdmin
      .from("relationships")
      .select("lead_score, lead_status, is_ghosting, ghosting_days")
      .eq("id", cid)
      .eq("user_id", userId)
      .single()

    if (contact) {
      results[cid] = {
        score: { score: contact.lead_score || 0, status: contact.lead_status || "cold" },
        ghosting: {
          is_ghosting: contact.is_ghosting || false,
          ghosting_days: contact.ghosting_days || 0,
          suggestion: null,
        },
      }
    }
  }
  return results
}

// ── Thread meta helper ──────────────────────────────────────────────────────
// Stores the total processed message count for a thread so cache checks
// aren't thrown off by skipped short messages.

async function upsertThreadMeta(userId: string, threadId: string, totalMessages: number) {
  const metaId = `__thread_meta_${threadId}__`
  await supabaseAdmin
    .from("email_analyses")
    .upsert(
      {
        user_id: userId,
        gmail_message_id: metaId,
        gmail_thread_id: threadId,
        direction: "inbound",
        intent: "neutral",
        intent_confidence: totalMessages, // repurpose as counter
        sentiment: "neutral",
        signals: [],
        reasoning: `Thread meta: ${totalMessages} messages processed`,
      },
      { onConflict: "user_id,gmail_message_id" }
    )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getHeader(msg: any, name: string): string {
  return msg?.payload?.headers?.find(
    (h: any) => h.name.toLowerCase() === name.toLowerCase()
  )?.value || ""
}

function extractEmail(header: string): string {
  const match = header.match(/<(.+?)>/)
  return match ? match[1] : header.trim()
}

function extractBody(msg: any): string {
  const payload = msg?.payload
  if (!payload) return ""

  // Try plain text first (better for analysis)
  const textPart = findPart(payload, "text/plain")
  if (textPart?.body?.data) {
    return decodeBase64Url(textPart.body.data)
  }

  // Fallback to HTML (strip tags)
  const htmlPart = findPart(payload, "text/html")
  if (htmlPart?.body?.data) {
    const html = decodeBase64Url(htmlPart.body.data)
    return stripHtml(html)
  }

  // Direct body data
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }

  return msg.snippet || ""
}

function findPart(payload: any, mimeType: string): any {
  if (payload.mimeType === mimeType) return payload
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = findPart(part, mimeType)
      if (found) return found
    }
  }
  return null
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(base64, "base64").toString("utf-8")
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}
