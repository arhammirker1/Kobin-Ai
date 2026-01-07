import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, relationship_id, relationship_name, project_id } = body

    // 1️⃣ USER CLIENT — CHECK PERMISSIONS
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", user.id).single()

    // Allow founders and team members with relationship access
    if (!profile || profile.user_type !== "founder") {
      // Check if team member has relationship access
      if (profile?.user_type === "team_member") {
        const { data: teamMember } = await supabase
          .from("team_members")
          .select("can_view_relationships")
          .eq("user_id", user.id)
          .single()

        if (!teamMember?.can_view_relationships) {
          return NextResponse.json({ message: "Insufficient permissions" }, { status: 403 })
        }
      } else {
        return NextResponse.json({ message: "User not allowed" }, { status: 403 })
      }
    }

    // 2️⃣ ADMIN CLIENT — CREATE USER
    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "client", // Tell the trigger to set user_type='client'
        created_by: user.id, // Pass founder ID so trigger can set created_by
      },
    })

    if (createError || !createdUser.user) {
      return NextResponse.json({ message: createError?.message }, { status: 400 })
    }

    const newUserId = createdUser.user.id

    // 3️⃣ ADMIN CLIENT — INSERT CLIENT RECORD (trigger will create profile with correct user_type)
    const clientData: any = {
      user_id: newUserId,
      founder_id: profile?.user_type === "founder" ? user.id : user.id,
      is_active: true,
    }

    if (relationship_id) {
      clientData.relationship_id = relationship_id
    }

    if (project_id) {
      clientData.project_id = project_id
    }

    const { error: clientError } = await supabaseAdmin.from("clients").insert(clientData)

    if (clientError) {
      console.error("[v0] Error creating client record:", clientError)
      return NextResponse.json({ message: clientError.message }, { status: 400 })
    }

    console.log("[v0] Client created successfully with user_id:", newUserId)
    return NextResponse.json({ success: true, client_id: newUserId })
  } catch (error: any) {
    console.error("[v0] Error creating client:", error)
    return NextResponse.json({ message: error.message || "Server error" }, { status: 500 })
  }
}
