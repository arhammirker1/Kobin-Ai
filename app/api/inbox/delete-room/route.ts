import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { room_id } = await req.json()
  if (!room_id) return NextResponse.json({ error: "room_id required" }, { status: 400 })

  // Verify user is a member of this room before allowing delete
  const { data: membership } = await supabase
    .from("chat_room_members")
    .select("id")
    .eq("room_id", room_id)
    .eq("user_id", user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this room" }, { status: 403 })
  }

  // Use admin client to bypass RLS for full deletion
  await supabaseAdmin.from("chat_messages").delete().eq("room_id", room_id)
  await supabaseAdmin.from("chat_room_members").delete().eq("room_id", room_id)
  await supabaseAdmin.from("chat_rooms").delete().eq("id", room_id)

  return NextResponse.json({ success: true })
}