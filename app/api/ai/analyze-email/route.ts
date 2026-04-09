import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGroqClient, GROQ_MODEL_STD } from "@/lib/ai/groq"
import { refreshGoogleToken } from "@/lib/google/token"
import { sendAIMessage } from "@/lib/ai/inbox-dm"
import { NextResponse } from "next/server"

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

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { thread_id, relationship_id } = await request.json()
    if (!thread_id || !relationship_id) return NextResponse.json({ error: "thread_id and relationship_id required" }, { status: 400 })

    const { data: rel } = await supabaseAdmin
      .from("relationships")
      .select("id, full_name, email, pipeline_stage, lead_score, deal_value, close_probability")
      .eq("id", relationship_id).single()

    if (!rel) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const { data: integration } = await supabaseAdmin
      .from("google_integrations").select("*").eq("user_id", user.id).eq("is_connected", true).single()

    if (!integration) return NextResponse.json({ error: "Gmail not connected" }, { status: 400 })

    const accessToken = await refreshGoogleToken(integration)
    const tRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread_id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!tRes.ok) return NextResponse.json({ error: "Thread not found" }, { status: 404 })
    const tData = await tRes.json()
    const messages = tData.messages || []

    const emailContent = messages.slice(-5).map((msg: any) => {
      const getH = (n: string) => msg.payload?.headers?.find((h: any) => h.name === n)?.value || ""
      return `From: ${getH("From")}\nDate: ${getH("Date")}\n${extractBody(msg.payload).slice(0, 500)}`
    }).join("\n\n---\n\n")

    const subject = messages[0]?.payload?.headers?.find((h: any) => h.name === "Subject")?.value || ""

    const groq = getGroqClient()
    const resp = await groq.chat.completions.create({
      model: GROQ_MODEL_STD,
      max_tokens: 600,
      temperature: 0,
      messages: [{
        role: "user",
        content: `Analyze this email conversation for a sales pipeline.

Contact: ${rel.full_name} | Email: ${rel.email} | Current stage: ${rel.pipeline_stage}
Subject: ${subject}

Thread:
${emailContent}

Respond ONLY with valid JSON, no markdown:
{
  "intent": "interested|not_interested|requesting_info|requesting_meeting|following_up|neutral|objection|ready_to_close",
  "sentiment": "positive|neutral|negative",
  "urgency": "high|medium|low",
  "suggested_stage": "new_lead|contacted|meeting_booked|proposal|negotiating|closed_won|closed_lost|null",
  "stage_change_reason": "string or null",
  "score_delta": -20 to 20,
  "action_items": ["action 1", "action 2"],
  "important": true or false,
  "importance_reason": "string or null",
  "signals": ["signal 1"],
  "summary": "1-2 sentence summary"
}`
      }]
    })

    let analysis: any = {}
    try {
      analysis = JSON.parse((resp.choices[0]?.message?.content || "{}").replace(/```json|```/g, "").trim())
    } catch {
      return NextResponse.json({ error: "AI parse failed" }, { status: 500 })
    }

    // Save analysis
    await supabaseAdmin.from("email_analyses").upsert({
      user_id: user.id,
      gmail_thread_id: thread_id,
      gmail_message_id: messages[messages.length - 1]?.id || thread_id,
      contact_id: relationship_id,
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

    // Update lead score
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

    await supabaseAdmin.from("relationships").update(updates).eq("id", relationship_id)

    // Auto-create tasks from action items
    const createdTasks: any[] = []
    for (const item of (analysis.action_items || []).slice(0, 2)) {
      const { data: task } = await supabaseAdmin.from("tasks").insert({
        user_id: user.id,
        created_by: user.id,
        title: item,
        bucket: analysis.urgency === "high" ? "today" : "this-week",
        status: "todo",
        priority: analysis.urgency === "high" ? "high" : "medium",
        is_completed: false,
        notes: `Auto-created from email with ${rel.full_name} (${subject})`,
      }).select("id, title").single()
      if (task) createdTasks.push(task)
    }

    // Post AI inbox message for important emails
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

      await sendAIMessage(user.id,
        `📧 **Important email from ${rel.full_name}**\n\n${analysis.importance_reason}\n\n*Sentiment: ${analysis.sentiment} · Intent: ${analysis.intent.replace(/_/g, " ")}*${stageNote}${taskNote}${scoreNote}\n\n_Subject: ${subject}_`
      )
    }

    return NextResponse.json({
      analysis,
      score_before: currentScore,
      score_after: newScore,
      stage_changed: updates.pipeline_stage ? { from: rel.pipeline_stage, to: updates.pipeline_stage } : null,
      tasks_created: createdTasks,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}