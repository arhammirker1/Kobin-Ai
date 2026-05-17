/**
 * FILE LOCATION: app/api/google/disconnect/route.ts
 *
 * PURPOSE: Disconnects the user's Google account from Kobin Ai.
 * Called when user clicks "Disconnect" in Settings.
 *
 * URL it handles: POST /api/google/disconnect
 *
 * What it does:
 *  1. Fetches the user's stored tokens
 *  2. Revokes the access token on Google's side (so Google also forgets CC)
 *  3. Clears the tokens from the google_integrations table in the DB
 */

import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 })
    }

    // Get the stored tokens so we can revoke them on Google's side
    const { data: integration } = await supabaseAdmin
      .from("google_integrations")
      .select("access_token, refresh_token")
      .eq("user_id", user.id)
      .single()

    // Tell Google to revoke the token (best effort — ignore if it fails)
    if (integration?.access_token) {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${integration.access_token}`,
        { method: "POST" }
      ).catch(() => {})
    }

    // Clear tokens from our DB and mark as disconnected
    await supabaseAdmin
      .from("google_integrations")
      .update({
        is_connected: false,
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ message }, { status: 500 })
  }
}