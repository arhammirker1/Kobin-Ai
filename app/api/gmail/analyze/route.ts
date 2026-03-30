import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshGoogleToken } from "@/lib/google/token"
import { analyzeEmail } from "@/lib/ai/email-intelligence"
import { scoreAndPersist } from "@/lib/ai/lead-scoring"
import { detectAndPersist } from "@/lib/ai/ghosting-detector"
import { NextResponse } from "next/server"

// POST /api/gmail/analyze
// Analyzes all unanalyzed messages in a Gmail thread.
// Called lazily after the thread is loaded in the UI.

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { threadId } = await request.json()
    if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 })

    // 1. Get Google token
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

    // 2. Fetch thread messages from Gmail (full body for analysis)
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
      return NextResponse.json({ analyses: [], thread_summary: null })
    }

    // 3. Check which messages are already analyzed
    const messageIds = messages.map((m: any) => m.id)
    const { data: existingAnalyses } = await supabaseAdmin
      .from("email_analyses")
      .select("gmail_message_id, intent, intent_confidence, sentiment, signals, reasoning")
      .eq("user_id", user.id)
      .in("gmail_message_id", messageIds)

    const analyzedIds = new Set(existingAnalyses?.map((a) => a.gmail_message_id) || [])

    // 4. Analyze unanalyzed messages
    const newAnalyses: Array<Record<string, any>> = []

    for (const msg of messages) {
      if (analyzedIds.has(msg.id)) continue

      // Extract email body and sender
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

      const row = {
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
      }

      newAnalyses.push(row)
    }

    // 5. Batch insert new analyses
    if (newAnalyses.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("email_analyses")
        .upsert(newAnalyses, { onConflict: "user_id,gmail_message_id" })

      if (insertError) {
        console.error("[Analyze] Insert error:", insertError)
      }
    }

    // 6. Get all analyses for this thread (existing + new)
    const { data: allAnalyses } = await supabaseAdmin
      .from("email_analyses")
      .select("gmail_message_id, intent, intent_confidence, sentiment, signals, reasoning, direction, contact_id")
      .eq("user_id", user.id)
      .eq("gmail_thread_id", threadId)
      .order("analyzed_at", { ascending: true })

    // 7. Trigger lead scoring + ghosting for matched contacts
    const contactIds = [...new Set(
      (allAnalyses || [])
        .map((a) => a.contact_id)
        .filter(Boolean)
    )] as string[]

    const scoreResults: Record<string, any> = {}
    for (const cid of contactIds) {
      const [scoreResult, ghostingResult] = await Promise.all([
        scoreAndPersist(cid, user.id),
        detectAndPersist(cid, user.id),
      ])
      scoreResults[cid] = { score: scoreResult, ghosting: ghostingResult }
    }

    // 8. Build response — keyed by message ID for easy frontend lookup
    const analysisMap: Record<string, any> = {}
    for (const a of allAnalyses || []) {
      analysisMap[a.gmail_message_id] = {
        intent: a.intent,
        intent_confidence: a.intent_confidence,
        sentiment: a.sentiment,
        signals: a.signals,
        reasoning: a.reasoning,
        direction: a.direction,
      }
    }

    // Thread-level summary
    const inboundAnalyses = (allAnalyses || []).filter((a) => a.direction === "inbound")
    let threadSummary = null
    if (inboundAnalyses.length > 0) {
      const { summarizeThreadAnalyses } = await import("@/lib/ai/email-intelligence")
      threadSummary = summarizeThreadAnalyses(
        inboundAnalyses.map((a) => ({
          intent: a.intent,
          intent_confidence: a.intent_confidence,
          sentiment: a.sentiment,
          signals: a.signals || [],
          reasoning: a.reasoning || "",
        }))
      )
    }

    return NextResponse.json({
      analyses: analysisMap,
      thread_summary: threadSummary,
      contact_scores: scoreResults,
      analyzed_count: newAnalyses.length,
    })
  } catch (err) {
    console.error("[Analyze] Error:", err)
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
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
