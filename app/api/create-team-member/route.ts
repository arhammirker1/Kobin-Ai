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
      can_view_projects,
      can_create_projects,
      can_access_clients,
      can_access_inbox,
    } = body

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

    // ── Plan enforcement — check team seat limit ────────────────────────────
    const { count: seatCount } = await supabaseAdmin
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("founder_id", user.id)
      .eq("is_active", true)
    const { requireWithinLimit } = await import("@/lib/plan-guard")
    const limitGuard = await requireWithinLimit(user.id, "max_team_seats", seatCount ?? 0)
    if (limitGuard) return limitGuard

    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    })

    if (createError || !createdUser.user) {
      return NextResponse.json(
        { message: createError?.message || "Failed to create user" },
        { status: 400 }
      )
    }

    const newUserId = createdUser.user.id

    await supabaseAdmin.from("profiles").upsert({
      id: newUserId,
      full_name,
      email,
      user_type: "team_member",
      created_by: user.id,
    })

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
      can_view_projects: can_view_projects ?? true,
      can_create_projects: can_create_projects ?? false,
      can_access_clients: can_access_clients ?? false,
      can_access_inbox: can_access_inbox ?? true,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ message }, { status: 500 })
  }
}