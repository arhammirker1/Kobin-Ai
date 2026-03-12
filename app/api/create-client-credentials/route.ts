import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { client_id, email, password, can_create_tasks } = body

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

    const isFounder = profile?.user_type === "founder"

    if (!isFounder) {
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("can_access_clients")
        .eq("user_id", user.id)
        .single()

      if (!teamMember?.can_access_clients) {
        return NextResponse.json({ message: "Permission denied" }, { status: 403 })
      }
    }

    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
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
      email,
      user_type: "client",
      created_by: user.id,
    })

    const { error: updateError } = await supabaseAdmin
      .from("clients")
      .update({
        portal_email: email,
        has_portal_access: true,
        can_create_tasks: can_create_tasks ?? false,
      })
      .eq("id", client_id)

    if (updateError) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      return NextResponse.json({ message: updateError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ message }, { status: 500 })
  }
}