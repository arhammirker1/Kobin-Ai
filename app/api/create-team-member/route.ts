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
      founder_id,
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

    // Verify requester is authenticated as founder
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || user.id !== founder_id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    // Create auth user using admin API
    const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Skip email verification
      user_metadata: {
        full_name,
      },
    })

    if (authError) {
      console.error("[v0] Auth error:", authError)
      return NextResponse.json({ message: authError.message }, { status: 400 })
    }

    if (!newUser.user) {
      return NextResponse.json({ message: "Failed to create user" }, { status: 500 })
    }

    // Update profile to set user_type and created_by
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        user_type: "team_member",
        created_by: founder_id,
      })
      .eq("id", newUser.user.id)

    if (profileError) {
      console.error("[v0] Profile error:", profileError)
      // Rollback: delete the auth user
      await supabase.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ message: profileError.message }, { status: 500 })
    }

    // Create team member record with permissions
    const { error: teamMemberError } = await supabase.from("team_members").insert({
      user_id: newUser.user.id,
      founder_id,
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
      // Rollback: delete the auth user
      await supabase.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ message: teamMemberError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, user_id: newUser.user.id })
  } catch (error: any) {
    console.error("[v0] Unexpected error:", error)
    return NextResponse.json({ message: error.message || "Internal server error" }, { status: 500 })
  }
}
