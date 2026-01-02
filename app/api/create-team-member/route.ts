import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      full_name,
      email,
      password,
      position,
      can_view_tasks,
      can_update_task_status,
      can_create_tasks,
      can_view_calendar,
      can_view_linkedin,
      can_view_relationships,
      can_view_vault,
      can_view_analytics,
    } = body

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 })
    }

    // Verify requester is a founder
    const { data: requesterProfile, error: profileFetchError } = await supabase
      .from("profiles")
      .select("user_type")
      .eq("id", user.id)
      .single()

    if (profileFetchError || !requesterProfile || requesterProfile.user_type !== "founder") {
      console.error("[v0] Authorization failed:", profileFetchError, requesterProfile)
      return NextResponse.json({ message: "User not allowed" }, { status: 403 })
    }

    const { data: signUpData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
        },
      },
    })

    if (authError) {
      console.error("[v0] Auth error:", authError)
      return NextResponse.json({ message: authError.message }, { status: 400 })
    }

    if (!signUpData.user) {
      return NextResponse.json({ message: "Failed to create user" }, { status: 500 })
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        user_type: "team_member",
        created_by: user.id,
      })
      .eq("id", signUpData.user.id)

    if (profileError) {
      console.error("[v0] Profile error:", profileError)
      return NextResponse.json({ message: profileError.message }, { status: 500 })
    }

    const { error: teamMemberError } = await supabase.from("team_members").insert({
      user_id: signUpData.user.id,
      founder_id: user.id,
      position,
      can_view_tasks,
      can_update_task_status,
      can_create_tasks,
      can_view_calendar,
      can_view_linkedin,
      can_view_relationships,
      can_view_vault,
      can_view_analytics,
    })

    if (teamMemberError) {
      console.error("[v0] Team member error:", teamMemberError)
      return NextResponse.json({ message: teamMemberError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, user_id: signUpData.user.id })
  } catch (error: any) {
    console.error("[v0] Unexpected error:", error)
    return NextResponse.json({ message: error.message || "Internal server error" }, { status: 500 })
  }
}
