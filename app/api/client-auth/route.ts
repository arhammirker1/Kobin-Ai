import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: "Missing email or password" }, { status: 400 })
    }

    const supabase = await createClient()

    // Find client by portal email
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("portal_email", email)
      .eq("has_portal_access", true)
      .eq("status", "active")
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, client.portal_password_hash)

    if (!isValidPassword) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    // Create session token
    const sessionToken = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24) // 24 hour session

    // Store session
    await supabase.from("client_sessions").insert({
      client_id: client.id,
      session_token: sessionToken,
      expires_at: expiresAt.toISOString(),
    })

    // Update last login
    await supabase.from("clients").update({ last_login: new Date().toISOString() }).eq("id", client.id)

    return NextResponse.json({
      success: true,
      sessionToken,
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        company: client.company,
      },
    })
  } catch (error: any) {
    console.error("[v0] Error in client-auth:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
