import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
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

    // 1️⃣ USER CLIENT — CHECK FOUNDER
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_type")
      .eq("id", user.id)
      .single()

    if (!profile || profile.user_type !== "founder") {
      return NextResponse.json({ message: "User not allowed" }, { status: 403 })
    }

    // 2️⃣ ADMIN CLIENT — CREATE USER
    const { data: createdUser, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      })

    if (createError || !createdUser.user) {
      return NextResponse.json({ message: createError?.message }, { status: 400 })
    }

    const newUserId = createdUser.user.id

    // 3️⃣ ADMIN CLIENT — UPDATE PROFILE
    await supabaseAdmin.from("profiles").update({
      user_type: "team_member",
      created_by: user.id,
    }).eq("id", newUserId)

    // 4️⃣ ADMIN CLIENT — INSERT TEAM MEMBER
    await supabaseAdmin.from("team_members").insert({
      user_id: newUserId,
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

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || "Server error" },
      { status: 500 }
    )
  }
}
