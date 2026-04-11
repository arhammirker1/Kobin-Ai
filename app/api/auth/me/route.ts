/**
 * GET /api/auth/me
 * 
 * Returns the current authenticated user's info.
 * Used by the Electron desktop app to get user_id for recording uploads.
 */

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

export async function GET() {
  try {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {},
        },
      }
    )

    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      )
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
    })
  } catch (error: any) {
    console.error("[auth/me] Error:", error)
    return NextResponse.json(
      { error: "Authentication check failed" },
      { status: 500 }
    )
  }
}
