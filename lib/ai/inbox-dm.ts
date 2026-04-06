import { supabaseAdmin } from "@/lib/supabase/admin"

/**
 * Finds or creates a dedicated AI Assistant DM room for a founder,
 * then sends a message that renders as an AI bubble in the inbox.
 */
export async function sendAIMessage(founderId: string, content: string): Promise<void> {
  const dmKey = `ai-assistant:${founderId}`

  // Find existing AI room
  const { data: existingRoom } = await supabaseAdmin
    .from("chat_rooms")
    .select("id")
    .eq("dm_key", dmKey)
    .maybeSingle()

  let roomId: string

  if (existingRoom?.id) {
    roomId = existingRoom.id
  } else {
    // Create dedicated AI room
    const { data: newRoom, error: roomError } = await supabaseAdmin
      .from("chat_rooms")
      .insert({
        name: "✦ AI Assistant",
        type: "direct",
        founder_id: founderId,
        created_by: founderId,
        dm_key: dmKey,
      })
      .select("id")
      .single()

    if (roomError || !newRoom) {
      console.error("[AI-DM] Failed to create AI room:", roomError)
      return
    }

    roomId = newRoom.id

    // Add founder as member
    await supabaseAdmin
      .from("chat_room_members")
      .insert({ room_id: roomId, user_id: founderId })
  }

  // Insert the AI message
  const { error: msgError } = await supabaseAdmin
    .from("chat_messages")
    .insert({
      room_id: roomId,
      sender_id: founderId,
      content,
      is_ai: true,
      message_type: "ai_response",
    })

  if (msgError) {
    console.error("[AI-DM] Failed to send message:", msgError)
    return
  }

  // Send a push notification so the founder sees it
  try {
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", founderId)

    if (subs?.length) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/push/send-to-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: founderId,
          payload: {
            type: "inbox_message",
            title: "✦ AI Assistant",
            body: content.slice(0, 100),
            room_id: roomId,
            sender_name: "AI Assistant",
            message_preview: content.slice(0, 100),
          },
        }),
      }).catch(() => {})
    }
  } catch {}
}

/**
 * Returns all active founder user IDs.
 */
export async function getAllFounders(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_type", "founder")

  if (error || !data) return []
  return data.map((p) => p.id)
}