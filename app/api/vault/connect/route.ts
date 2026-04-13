/**
 * app/api/vault/connect/route.ts
 *
 * Initializes the Google Drive Vault root folder for a founder.
 * Called when founder clicks "Connect Drive" in the Vault sidebar.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { initializeVaultForFounder } from "@/lib/google/drive"

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    // Resolve founder ID (team members use their founder's vault)
    let founderId = user.id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_type")
      .eq("id", user.id)
      .single()

    if (profile?.user_type === "team_member") {
      return NextResponse.json(
        { message: "Only founders can connect Drive" },
        { status: 403 }
      )
    }

    await initializeVaultForFounder(founderId)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("[vault/connect]", err)
    return NextResponse.json(
      { message: err.message || "Failed to connect Drive" },
      { status: 500 }
    )
  }
}