import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { userId, memberId } = await request.json()

    if (!userId || !memberId) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 })
    }

    // 1. Authenticate the founder
    const supabase = await createClient()
    const {
      data: { user: founder },
    } = await supabase.auth.getUser()

    if (!founder) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 })
    }

    // 2. Check if the user is a founder
    const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", founder.id).single()

    if (!profile || profile.user_type !== "founder") {
      return NextResponse.json({ message: "Only founders can delete team members" }, { status: 403 })
    }

    // 3. Delete the team member from the team_members table first (optional if cascade is set, but safer)
    await supabaseAdmin.from("team_members").delete().eq("id", memberId)

    // 4. Delete the user from Supabase Auth (this will trigger cascade deletions in profiles/team_members)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error("[v0] Auth deletion error:", deleteError)
      return NextResponse.json({ message: deleteError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] Server error deleting team member:", error)
    return NextResponse.json({ message: error.message || "Server error" }, { status: 500 })
  }
}
