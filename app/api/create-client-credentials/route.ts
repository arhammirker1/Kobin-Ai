import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { clientId, email, password } = await request.json()

    if (!clientId || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10)

    // Update client with portal credentials
    const { data, error } = await supabase
      .from("clients")
      .update({
        has_portal_access: true,
        portal_email: email,
        portal_password_hash: passwordHash,
      })
      .eq("id", clientId)
      .select()
      .single()

    if (error) {
      console.error("[v0] Error creating client credentials:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error("[v0] Error in create-client-credentials:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
