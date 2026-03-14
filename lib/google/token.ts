/**
 * FILE LOCATION: lib/google/token.ts
 *
 * PURPOSE: Utility that makes sure we always have a valid Google access token.
 * Google access tokens expire after 1 hour. This function checks the expiry
 * and automatically refreshes using the stored refresh_token if needed.
 *
 * Used by: app/api/google/create-meet/route.ts (before every Google API call)
 *
 * You do NOT need to call this manually from the frontend — the API route
 * handles it internally before talking to Google.
 */

import { supabaseAdmin } from "@/lib/supabase/admin"

interface GoogleIntegration {
  user_id: string
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
}

export async function refreshGoogleToken(
  integration: GoogleIntegration
): Promise<string> {
  const { access_token, refresh_token, token_expires_at, user_id } = integration

  // Check if the current token is still valid (with 60 second buffer)
  const isExpired =
    !token_expires_at ||
    new Date(token_expires_at).getTime() < Date.now() + 60_000

  if (!isExpired && access_token) {
    // Token still valid — return it as-is
    return access_token
  }

  if (!refresh_token) {
    throw new Error("No refresh token available. User must reconnect Google account.")
  }

  // Token expired — ask Google for a new one using the refresh token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token,
      grant_type: "refresh_token",
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error("[Token Refresh] Failed:", err)
    throw new Error("Failed to refresh Google token. User may need to reconnect.")
  }

  const data = await res.json()
  const newAccessToken = data.access_token
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()

  // Save the new token back to the database
  await supabaseAdmin
    .from("google_integrations")
    .update({
      access_token: newAccessToken,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user_id)

  return newAccessToken
}