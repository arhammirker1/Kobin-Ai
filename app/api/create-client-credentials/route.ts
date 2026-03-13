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

    // Fetch client name to use as full_name
    const { data: clientRecord } = await supabaseAdmin
      .from("clients")
      .select("name")
      .eq("id", client_id)
      .single()

    await supabaseAdmin.from("profiles").upsert({
      id: newUserId,
      email,
      full_name: clientRecord?.name || email,
      user_type: "client",
      created_by: user.id,
    })

    const { data: updatedClient, error: updateError } = await supabaseAdmin
      .from("clients")
      .update({
        portal_email: email,
        portal_user_id: newUserId,
        has_portal_access: true,
        can_create_tasks: can_create_tasks ?? false,
      })
      .eq("id", client_id)
      .select("project_id, founder_id")
      .single()

    if (updateError) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      return NextResponse.json({ message: updateError.message }, { status: 400 })
    }

    // Auto-add client to their project chat room
    if (updatedClient?.project_id) {
      const { data: projectRoom } = await supabaseAdmin
        .from("chat_rooms")
        .select("id")
        .eq("project_id", updatedClient.project_id)
        .eq("type", "project")
        .maybeSingle()

      if (projectRoom) {
        await supabaseAdmin
          .from("chat_room_members")
          .insert({ room_id: projectRoom.id, user_id: newUserId })
      }
    }

    // Auto-create DM with founder so it shows up immediately
    if (updatedClient?.founder_id) {
      const dmKey = [newUserId, updatedClient.founder_id].sort().join(":")

      const { data: existingDM } = await supabaseAdmin
        .from("chat_rooms")
        .select("id")
        .eq("dm_key", dmKey)
        .maybeSingle()

      if (!existingDM) {
        const { data: newDM } = await supabaseAdmin
          .from("chat_rooms")
          .insert({
            type: "direct",
            founder_id: updatedClient.founder_id,
            created_by: updatedClient.founder_id,
            dm_key: dmKey,
          })
          .select("id")
          .single()

        if (newDM) {
          await supabaseAdmin.from("chat_room_members").insert([
            { room_id: newDM.id, user_id: newUserId },
            { room_id: newDM.id, user_id: updatedClient.founder_id },
          ])
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ message }, { status: 500 })
  }
}