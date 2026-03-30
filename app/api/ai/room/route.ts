import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

// ── GET /api/ai/room ────────────────────────────────────────────────────────
// Returns the AI chat room for the current user; creates one if needed.

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Resolve founder_id
    let founder_id = user.id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_type, full_name")
      .eq("id", user.id)
      .single()

    if (profile?.user_type === "team_member") {
      const { data: tm } = await supabaseAdmin
        .from("team_members")
        .select("founder_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single()
      if (tm?.founder_id) founder_id = tm.founder_id
    }

    const dmKey = `ai_${user.id}`

    // Check if AI room already exists
    const { data: existing } = await supabaseAdmin
      .from("chat_rooms")
      .select("id")
      .eq("dm_key", dmKey)
      .single()

    if (existing) {
      return NextResponse.json({ room_id: existing.id })
    }

    // Create the AI chat room
    const { data: room, error: roomError } = await supabaseAdmin
      .from("chat_rooms")
      .insert({
        name: "Kobin",
        type: "direct",
        founder_id,
        created_by: user.id,
        dm_key: dmKey,
      })
      .select("id")
      .single()

    if (roomError || !room) {
      console.error("[AI-ROOM] Create error:", roomError)
      return NextResponse.json({ error: "Failed to create AI room" }, { status: 500 })
    }

    // Add user as member
    await supabaseAdmin.from("chat_room_members").insert({
      room_id: room.id,
      user_id: user.id,
    })

    // Send welcome message from AI
    await supabaseAdmin.from("chat_messages").insert({
      room_id: room.id,
      sender_id: user.id,
      content: "Hey! I'm Kobin, your AI chief of staff. I have full access to your workspace — tasks, projects, CRM, calendar, email threads, and team workload.\n\nYou can ask me anything or tell me to take action. Try:\n• \"What's overdue?\"\n• \"Create a task for the client presentation\"\n• \"Who needs a follow-up?\"\n• \"Draft a reply to [contact name]\"",
      is_ai: true,
      ai_model: "system",
      message_type: "ai_response",
    })

    return NextResponse.json({ room_id: room.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    console.error("[AI-ROOM] Error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
