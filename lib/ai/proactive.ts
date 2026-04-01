// The Communicator — pushes AI-initiated messages to the AI room
import { supabaseAdmin } from "@/lib/supabase/admin"
import { analyzeWorkspace } from "./intelligence"
import { buildMiniContext } from "./mini-context"
import { getGroqClient, GROQ_MODEL_STD } from "./groq"
import { pushToUser } from "@/lib/web-push/push-to-user"

/**
 * Ensure the AI room exists for this founder.
 * Creates it if missing. Returns room_id.
 */
export async function getOrCreateAIRoom(founderId: string): Promise<string> {
  const AI_ROOM_KEY = `ai-room:${founderId}`

  const { data: existing } = await supabaseAdmin
    .from("chat_rooms")
    .select("id")
    .eq("dm_key", AI_ROOM_KEY)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: newRoom } = await supabaseAdmin
    .from("chat_rooms")
    .insert({
      name: "AI · Command Center",
      type: "direct",
      founder_id: founderId,
      created_by: founderId,
      dm_key: AI_ROOM_KEY,
    })
    .select("id")
    .single()

  if (!newRoom) throw new Error("Failed to create AI room")

  // Add founder as member
  await supabaseAdmin.from("chat_room_members").insert({
    room_id: newRoom.id,
    user_id: founderId,
  })

  return newRoom.id
}

/**
 * Post a message FROM the AI into the AI room.
 * message_type = "ai_response" so the inbox renders it as an AI bubble.
 */
export async function postAIMessage(founderId: string, content: string): Promise<void> {
  const roomId = await getOrCreateAIRoom(founderId)

  await supabaseAdmin.from("chat_messages").insert({
    room_id: roomId,
    sender_id: founderId, // sent "as" the founder but flagged as AI
    content,
    is_ai: true,
    ai_model: GROQ_MODEL_STD,
    message_type: "ai_response",
  })

  // Push notification
  await pushToUser(founderId, {
    type: "inbox_message",
    title: "AI · Command Center",
    body: content.slice(0, 120),
    room_id: roomId,
    sender_name: "AI",
    message_preview: content.slice(0, 120),
  })
}

/**
 * Generate and post the morning briefing.
 */
export async function sendMorningBrief(founderId: string): Promise<void> {
  const [intel, miniCtx] = await Promise.all([
    analyzeWorkspace(founderId),
    buildMiniContext(founderId),
  ])

  const groq = getGroqClient()
  const response = await groq.chat.completions.create({
    model: GROQ_MODEL_STD,
    max_tokens: 400,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: `You are the AI chief of staff for Command Center. Write a sharp morning briefing. 
Be direct, no fluff. Use this format:

Good morning — here's what matters today:

1. [Most critical risk or action]
2. [Second priority]
3. [Third priority]

Then one line: "Focus: [single most important thing]"

Workspace context:
${miniCtx}

Intelligence analysis:
Risks: ${intel.risks.slice(0, 5).map(r => `${r.severity.toUpperCase()}: ${r.title} — ${r.detail}`).join("\n")}
Bottlenecks: ${intel.bottlenecks.join("; ") || "none"}
Team: ${intel.teamStatus.map(m => `${m.name} [${m.load}]`).join(", ")}`,
      },
      { role: "user", content: "Generate my morning briefing." },
    ],
  })

  const content = response.choices[0]?.message?.content || ""
  if (content) await postAIMessage(founderId, content)
}

/**
 * Generate and post real-time risk alert.
 */
export async function sendRiskAlert(founderId: string, riskSummary: string): Promise<void> {
  await postAIMessage(founderId, `⚠️ **Heads up**\n\n${riskSummary}`)
}

/**
 * Generate and post end-of-day summary.
 */
export async function sendEODSummary(founderId: string): Promise<void> {
  const intel = await analyzeWorkspace(founderId)
  const groq = getGroqClient()

  // Fetch today's completed tasks
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: completedToday } = await supabaseAdmin
    .from("tasks")
    .select("title")
    .eq("user_id", founderId)
    .eq("is_completed", true)
    .gte("updated_at", todayStart.toISOString())

  const response = await groq.chat.completions.create({
    model: GROQ_MODEL_STD,
    max_tokens: 300,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: `Write a brief end-of-day summary. Format:

**Today:**
- [X] tasks completed
- [X] still open
- [Any notable progress or slippage]

**Tomorrow's top priority:** [one clear item]

Completed tasks: ${completedToday?.map(t => t.title).join(", ") || "none logged"}
Remaining risks: ${intel.risks.slice(0, 3).map(r => r.title).join(", ") || "none"}`,
      },
      { role: "user", content: "EOD summary." },
    ],
  })

  const content = response.choices[0]?.message?.content || ""
  if (content) await postAIMessage(founderId, content)
}