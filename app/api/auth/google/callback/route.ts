/**
 * FILE LOCATION: app/api/auth/google/callback/route.ts
 *
 * PURPOSE: Google redirects the user back HERE after they approve access.
 * This file exchanges the temporary "code" Google sends for real
 * access + refresh tokens, then saves them to the database.
 *
 * URL it handles: GET /api/auth/google/callback
 * (This URL must exactly match what you set in Google Cloud Console
 *  under "Authorized redirect URIs")
 *
 * After success → redirects to /settings?success=google_connected
 * After failure → redirects to /settings?error=...
 */

import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")

  if (error) {
    console.error("[Google OAuth] Error:", error)
    return NextResponse.redirect(
      new URL("/?tab=settings&error=google_auth_failed", request.url)
    )
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/?tab=settings&error=no_code", request.url)
    )
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url))
    }

    // Exchange the temporary code for access + refresh tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    })

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text()
      console.error("[Google OAuth] Token exchange failed:", err)
      return NextResponse.redirect(
        new URL("/?tab=settings&error=token_exchange_failed", request.url)
      )
    }

    const tokens = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokens

    // Get the user's Google email address
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const googleUser = await userInfoRes.json()

    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

    // Save tokens to the google_integrations table
    const { error: upsertError } = await supabaseAdmin
      .from("google_integrations")
      .upsert({
        user_id: user.id,
        google_email: googleUser.email,
        access_token,
        refresh_token,
        token_expires_at: expiresAt,
        is_connected: true,
        drive_connected: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })

    // Auto-initialize Vault root folder in Drive
    if (!upsertError) {
      try {
        const { initializeVaultForFounder } = await import("@/lib/google/drive")
        await initializeVaultForFounder(user.id)
      } catch (vaultErr) {
        console.warn("[Vault] Could not auto-init vault folder:", vaultErr)
        // Non-fatal — vault can be initialized later from Settings
      }
    }

    if (upsertError) {
      console.error("[Google OAuth] DB upsert error:", upsertError)
      return NextResponse.redirect(
        new URL("/?tab=settings&error=db_error", request.url)
      )
    }

    return NextResponse.redirect(
      new URL("/?tab=settings&success=google_connected", request.url)
    )
  } catch (err) {
    console.error("[Google OAuth] Unexpected error:", err)
    return NextResponse.redirect(
      new URL("/?tab=settings&error=unknown", request.url)
    )
  }
}