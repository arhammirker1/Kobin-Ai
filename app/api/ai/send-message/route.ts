import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"
import { pushToUser } from "@/lib/web-push/push-to-user"
import { GROQ_MODEL_STD } from "@/lib/ai/groq"

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { recipient_user_id, room_id: existingRoomId, message, recipient_name, founder_id } = await req.json()

  if (!message || (!recipient_user_id && !existingRoomId)) {
    return NextResponse.json({ error: "message and recipient required" }, { status: 400 })
  }

  let roomId = existingRoomId

  // Create DM room if needed
  if (!roomId && recipient_user_id) {
    const dmKey = [founder_id, recipient_user_id].sort().join(":")

    const { data: existing } = await supabaseAdmin
      .from("chat_rooms")
      .select("id")
      .eq("dm_key", dmKey)
      .maybeSingle()

    if (existing) {
      roomId = existing.id
    } else {
      const { data: newRoom } = await supabaseAdmin
        .from("chat_rooms")
        .insert({
          type: "direct",
          founder_id,
          created_by: founder_id,
          dm_key: dmKey,
        })
        .select("id")
        .single()

      if (newRoom) {
        roomId = newRoom.id
        await supabaseAdmin.from("chat_room_members").insert([
          { room_id: roomId, user_id: founder_id },
          { room_id: roomId, user_id: recipient_user_id },
        ])
      }
    }
  }

  if (!roomId) {
    return NextResponse.json({ error: "Could not find or create room" }, { status: 400 })
  }

  // Send message marked as AI
  const { error } = await supabaseAdmin.from("chat_messages").insert({
    room_id: roomId,
    sender_id: founder_id,
    content: message,
    is_ai: true,
    ai_model: GROQ_MODEL_STD,
    message_type: "ai_response",
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Push notification to recipient
  if (recipient_user_id) {
    await pushToUser(recipient_user_id, {
      type: "inbox_message",
      title: "AI · Command Center",
      body: message.slice(0, 120),
      room_id: roomId,
      sender_name: "AI",
      message_preview: message.slice(0, 120),
    })
  }

  return NextResponse.json({ success: true })
}