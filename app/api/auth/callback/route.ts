import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")

  if (code) {
    const supabase = await createClient()
    try {
      await supabase.auth.exchangeCodeForSession(code)
      // Redirect to dashboard after successful email confirmation
      return NextResponse.redirect(new URL("/", request.url))
    } catch (error) {
      console.error("[v0] Email confirmation error:", error)
      // Redirect back to login with error
      return NextResponse.redirect(new URL("/login?error=email_confirmation_failed", request.url))
    }
  }

  // No code provided
  return NextResponse.redirect(new URL("/login", request.url))
}
