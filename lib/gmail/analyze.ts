/**
 * Shared email analysis logic.
 * Used by both the manual /api/ai/analyze-email endpoint and the
 * real-time Gmail webhook.  Keeping it here avoids duplication.
 */

import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGroqClient, GROQ_MODEL_STD } from "@/lib/ai/groq"
import { refreshGoogleToken } from "@/lib/google/token"
import { sendAIMessage } from "@/lib/ai/inbox-dm"

// ── helpers ──────────────────────────────────────────────────────────────────

function decodeBase64Url(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
  } catch { return "" }
}

function extractBody(payload: any): string {
  if (!payload) return ""
  if (payload.body?.data) return decodeBase64Url(payload.body.data)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data)
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data)
        return decodeBase64Url(part.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    }
  }
  return ""
}

const STAGES = ["new_lead", "contacted", "meeting_booked", "proposal", "negotiating", "closed_won", "closed_lost"]

export interface AnalysisResult {
  skipped?: boolean
  reason?: string
  analysis?: any
  score_before?: number
  score_after?: number
  stage_changed?: { from: string; to: string } | null
  tasks_created?: any[]
  error?: string
}

/**
 * Core analysis function — fetches the thread from Gmail, runs AI analysis,
 * updates the CRM contact, creates tasks, and sends inbox notifications.
 *
 * @param userId   - Supabase user ID
 * @param threadId - Gmail thread ID
 * @param relationshipId - CRM relationship ID to associate
 */
export async function analyzeEmailThread(
  userId: string,
  threadId: string,
  relationshipId: string,
): Promise<AnalysisResult> {
  try {
  console.log(`[analyzeEmail] Starting: user=${userId}, thread=${threadId}, rel=${relationshipId}`)

  // ── Dedup gate: skip if this exact message was already analyzed ──────────
  const { data: integration, error: intError } = await supabaseAdmin
    .from("google_integrations").select("*").eq("user_id", userId).eq("is_connected", true).single()

  if (!integration) {
    console.error(`[analyzeEmail] No integration found:`, intError)
    return { error: "Gmail not connected" }
  }

  console.log(`[analyzeEmail] Refreshing token for ${integration.google_email}`)
  const accessToken = await refreshGoogleToken(integration)
  console.log(`[analyzeEmail] Token refreshed OK`)

  // Check latest message ID for dedup
  const metaRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!metaRes.ok) return { error: "Thread not found" }

  const metaData = await metaRes.json()
  const latestMsgId = metaData.messages?.[metaData.messages.length - 1]?.id
  if (latestMsgId) {
    const { data: recentAnalysis } = await supabaseAdmin
      .from("email_analyses")
      .select("gmail_message_id")
      .eq("gmail_thread_id", threadId)
      .eq("user_id", userId)
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentAnalysis?.gmail_message_id === latestMsgId) {
      console.log(`[analyzeEmail] Skipped — same message ${latestMsgId} already analyzed`)
      return { skipped: true, reason: "no_new_messages" }
    }
  }

  // ── Fetch contact ────────────────────────────────────────────────────────
  const { data: rel } = await supabaseAdmin
    .from("relationships")
    .select("id, full_name, email, pipeline_stage, lead_score, deal_value, close_probability")
    .eq("id", relationshipId).single()

  if (!rel) {
    console.error(`[analyzeEmail] Relationship ${relationshipId} not found`)
    return { error: "Relationship not found" }
  }
  console.log(`[analyzeEmail] Contact: ${rel.full_name} (${rel.email})`)

  // ── Fetch full thread ────────────────────────────────────────────────────
  const tRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!tRes.ok) return { error: "Thread fetch failed" }

  const tData = await tRes.json()
  const messages = tData.messages || []

  const emailContent = messages.slice(-5).map((msg: any) => {
    const getH = (n: string) => msg.payload?.headers?.find((h: any) => h.name === n)?.value || ""
    return `From: ${getH("From")}\nDate: ${getH("Date")}\n${extractBody(msg.payload).slice(0, 500)}`
  }).join("\n\n---\n\n")

  const subject = messages[0]?.payload?.headers?.find((h: any) => h.name === "Subject")?.value || ""

  // ── AI analysis ──────────────────────────────────────────────────────────
  console.log(`[analyzeEmail] Calling Groq AI (model: ${GROQ_MODEL_STD})...`)
  const groq = getGroqClient()
  const resp = await groq.chat.completions.create({
    model: GROQ_MODEL_STD,
    max_tokens: 1024,
    temperature: 0,
    messages: [{
      role: "user",
      content: `Analyze this email conversation for a sales pipeline. Be concise.

Contact: ${rel.full_name} | Email: ${rel.email} | Current stage: ${rel.pipeline_stage}
Subject: ${subject}

Thread:
${emailContent}

Respond ONLY with valid JSON, no markdown. Keep strings SHORT (under 15 words each):
{
  "intent": "interested|not_interested|requesting_info|requesting_meeting|following_up|neutral|objection|ready_to_close",
  "sentiment": "positive|neutral|negative",
  "urgency": "high|medium|low",
  "suggested_stage": "new_lead|contacted|meeting_booked|proposal|negotiating|closed_won|closed_lost|null",
  "stage_change_reason": "short reason or null",
  "score_delta": -20 to 20,
  "action_items": ["short action"],
  "important": true or false,
  "importance_reason": "short reason or null",
  "signals": ["short signal"],
  "summary": "1 sentence summary"
}`
    }]
  })

  let analysis: any = {}
  const rawContent = resp.choices[0]?.message?.content || "{}"
  console.log(`[analyzeEmail] Groq raw response (first 500):`, rawContent.slice(0, 500))
  
  // Clean the raw content
  let cleanedContent = rawContent.replace(/```json|```/g, "").trim()
  
  try {
    analysis = JSON.parse(cleanedContent)
    console.log(`[analyzeEmail] Parsed analysis: intent=${analysis.intent}, sentiment=${analysis.sentiment}`)
  } catch (parseErr) {
    console.warn(`[analyzeEmail] First parse failed, attempting JSON repair...`)
    // Try to repair truncated JSON
    try {
      // Close any open strings, arrays, objects
      let repaired = cleanedContent
      // Count unbalanced braces/brackets
      const openBraces = (repaired.match(/{/g) || []).length
      const closeBraces = (repaired.match(/}/g) || []).length
      const openBrackets = (repaired.match(/\[/g) || []).length
      const closeBrackets = (repaired.match(/\]/g) || []).length
      
      // If inside a string (odd number of unescaped quotes after last complete key-value)
      // Truncate to the last complete value
      const lastCompleteComma = repaired.lastIndexOf(",\n")
      const lastCompleteBrace = repaired.lastIndexOf("}")
      if (lastCompleteComma > lastCompleteBrace && lastCompleteComma > 0) {
        repaired = repaired.slice(0, lastCompleteComma)
      }
      
      // Close brackets and braces
      for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += "]"
      for (let i = 0; i < openBraces - closeBraces; i++) repaired += "}"
      
      analysis = JSON.parse(repaired)
      console.log(`[analyzeEmail] Repaired JSON parsed OK: intent=${analysis.intent}`)
    } catch (repairErr) {
      console.error(`[analyzeEmail] JSON repair also failed:`, repairErr)
      console.error(`[analyzeEmail] Raw content: ${cleanedContent.slice(0, 500)}`)
      // Return a safe default analysis instead of failing completely
      analysis = {
        intent: "neutral",
        sentiment: "neutral",
        urgency: "low",
        suggested_stage: null,
        score_delta: 0,
        action_items: [],
        important: false,
        signals: [],
        summary: "Analysis failed — AI response was incomplete"
      }
      console.log(`[analyzeEmail] Using fallback analysis`)
    }
  }

  // ── Save analysis ────────────────────────────────────────────────────────
  await supabaseAdmin.from("email_analyses").upsert({
    user_id: userId,
    gmail_thread_id: threadId,
    gmail_message_id: messages[messages.length - 1]?.id || threadId,
    contact_id: relationshipId,
    sender_email: rel.email,
    direction: "inbound",
    intent: analysis.intent || "neutral",
    intent_confidence: 75,
    sentiment: analysis.sentiment || "neutral",
    signals: analysis.signals || [],
    reasoning: analysis.summary || "",
    thread_subject: subject,
    analyzed_at: new Date().toISOString(),
  }, { onConflict: "gmail_thread_id,user_id" })

  // ── Update lead score ────────────────────────────────────────────────────
  const currentScore = rel.lead_score || 0
  const newScore = Math.max(0, Math.min(100, currentScore + (analysis.score_delta || 0)))

  const updates: any = { lead_score: newScore, score_updated_at: new Date().toISOString() }

  // Auto-advance stage (never go backwards unless closing lost)
  const stageChanged = analysis.suggested_stage && analysis.suggested_stage !== rel.pipeline_stage
  if (stageChanged) {
    const curIdx = STAGES.indexOf(rel.pipeline_stage)
    const sugIdx = STAGES.indexOf(analysis.suggested_stage)
    if (sugIdx > curIdx || analysis.suggested_stage === "closed_lost") {
      updates.pipeline_stage = analysis.suggested_stage
      updates.stage_entered_at = new Date().toISOString()
    }
  }

  await supabaseAdmin.from("relationships").update(updates).eq("id", relationshipId)

  // ── Auto-create tasks from action items — max 1 per analysis ─────────
  const createdTasks: any[] = []
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const actionItems = (analysis.action_items || []).slice(0, 1)
  for (const item of actionItems) {
    const { data: existingTask } = await supabaseAdmin
      .from("tasks")
      .select("id")
      .eq("user_id", userId)
      .ilike("title", `%${item.slice(0, 30)}%`)
      .gte("created_at", oneDayAgo)
      .maybeSingle()
    if (existingTask) continue
    const { data: task } = await supabaseAdmin.from("tasks").insert({
      user_id: userId,
      created_by: userId,
      title: item,
      bucket: analysis.urgency === "high" ? "today" : "this-week",
      status: "todo",
      priority: analysis.urgency === "high" ? "high" : "medium",
      is_completed: false,
      notes: `Auto-created from email with ${rel.full_name} (${subject})`,
    }).select("id, title").single()
    if (task) createdTasks.push(task)
  }

  // ── Post AI inbox message for important emails ───────────────────────
  if (analysis.important && analysis.importance_reason) {
    const stageNote = updates.pipeline_stage
      ? `\n📊 Stage auto-updated: **${rel.pipeline_stage.replace(/_/g, " ")} → ${updates.pipeline_stage.replace(/_/g, " ")}**`
      : (stageChanged ? `\n💡 Stage suggestion: move to **${analysis.suggested_stage?.replace(/_/g, " ")}** — ${analysis.stage_change_reason}` : "")
    const taskNote = createdTasks.length > 0
      ? `\n✅ Task auto-created: "${createdTasks[0].title}"`
      : ""
    const scoreNote = analysis.score_delta !== 0
      ? `\n⭐ Lead score: ${currentScore} → ${newScore}`
      : ""

    await sendAIMessage(userId,
      `📧 **Important email from ${rel.full_name}**\n\n${analysis.importance_reason}\n\n*Sentiment: ${analysis.sentiment} · Intent: ${analysis.intent.replace(/_/g, " ")}*${stageNote}${taskNote}${scoreNote}\n\n_Subject: ${subject}_`
    )
  }

  return {
    analysis,
    score_before: currentScore,
    score_after: newScore,
    stage_changed: updates.pipeline_stage ? { from: rel.pipeline_stage, to: updates.pipeline_stage } : null,
    tasks_created: createdTasks,
  }
  } catch (err) {
    console.error(`[analyzeEmail] FATAL for thread ${threadId}:`, err instanceof Error ? err.stack : err)
    return { error: String(err) }
  }
}

/**
 * AI-powered lead relevance check.
 * Given an email, determines if the sender is a relevant business lead
 * worth adding to the CRM automatically.
 */
export async function checkLeadRelevance(
  senderEmail: string,
  senderName: string,
  subject: string,
  snippet: string,
): Promise<{ relevant: boolean; reason: string; suggestedName: string }> {
  try {
    const groq = getGroqClient()
    const resp = await groq.chat.completions.create({
      model: GROQ_MODEL_STD,
      max_tokens: 200,
      temperature: 0,
      messages: [{
        role: "user",
        content: `You are a business email classifier. Determine if this email sender is a RELEVANT business lead worth tracking in a CRM.

RELEVANT: potential clients, business partners, investors, collaborators, people requesting services/demos, recruiters with opportunities
NOT RELEVANT: newsletters, automated notifications, marketing blasts, support tickets from SaaS tools, social media notifications, spam, billing receipts, OTP/verification emails

From: ${senderName} <${senderEmail}>
Subject: ${subject}
Preview: ${snippet.slice(0, 300)}

Respond ONLY with valid JSON, no markdown:
{
  "relevant": true or false,
  "reason": "brief explanation",
  "suggested_name": "cleaned full name of the sender"
}`
      }]
    })

    const result = JSON.parse((resp.choices[0]?.message?.content || "{}").replace(/```json|```/g, "").trim())
    return {
      relevant: result.relevant === true,
      reason: result.reason || "",
      suggestedName: result.suggested_name || senderName || senderEmail.split("@")[0],
    }
  } catch {
    // On AI failure, default to not adding — safer
    return { relevant: false, reason: "AI check failed", suggestedName: senderName }
  }
}
