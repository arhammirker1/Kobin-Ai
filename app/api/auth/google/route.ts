/**
 * FILE LOCATION: app/api/auth/google/route.ts
 *
 * PURPOSE: Starts the Google OAuth login flow.
 * Called when user clicks "Connect Google Account" in Settings.
 * Redirects the user to Google's consent screen.
 *
 * URL it handles: GET /api/auth/google
 */

import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`

  if (!clientId) {
    return NextResponse.json(
      { error: "Google OAuth not configured" },
      { status: 500 }
    )
  }

  const scopes = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "openid",
  ].join(" ")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
    state: user.id,
  })

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

  return NextResponse.redirect(googleAuthUrl)
}