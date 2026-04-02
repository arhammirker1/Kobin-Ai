// Message → Task extraction (Message Intelligence)
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGroqClient, GROQ_MODEL_STD } from "@/lib/ai/groq"
import { NextResponse } from "next/server"

const INTENT_PROMPT = `You are analyzing a chat message to detect actionable content.

Message: "{message}"
Sender: "{sender}"
Room/Project: "{room}"

Respond with ONLY a JSON object (no markdown):
{
  "has_task": boolean,
  "task_title": "string or null",
  "assigned_to_hint": "name mentioned or null",
  "urgency": "today|this-week|backlog",
  "intent": "request|decision|commitment|info",
  "confidence": 0.0-1.0
}

Rules:
- has_task = true only if the message contains a clear request, commitment, or decision requiring action
- "get this done", "please do", "can you", "I need" = request
- "I will", "I'll handle", "I'm going to" = commitment  
- "we decided", "let's go with" = decision
- confidence below 0.6 → has_task = false
- Pure questions, greetings, or status updates → has_task = false`

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { message_id, content, sender_name, room_name } = await request.json()
    if (!content?.trim()) return NextResponse.json({ has_task: false })

    // Skip short messages and AI responses
    if (content.length < 15) return NextResponse.json({ has_task: false })

    const groq = getGroqClient()
    const prompt = INTENT_PROMPT
      .replace("{message}", content.slice(0, 300))
      .replace("{sender}", sender_name || "Unknown")
      .replace("{room}", room_name || "Unknown")

    const response = await groq.chat.completions.create({
      model: GROQ_MODEL_STD,
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    })

    const raw = response.choices[0]?.message?.content || "{}"
    let result: any = {}
    try {
      result = JSON.parse(raw.replace(/```json|```/g, "").trim())
    } catch {
      return NextResponse.json({ has_task: false })
    }

    return NextResponse.json({
      has_task: result.has_task === true && result.confidence >= 0.6,
      task_title: result.task_title,
      assigned_to_hint: result.assigned_to_hint,
      urgency: result.urgency || "this-week",
      intent: result.intent,
      confidence: result.confidence,
      message_id,
    })
  } catch (err) {
    console.error("[extract-task]", err)
    return NextResponse.json({ has_task: false })
  }
}