// GET /api/ai/analyze — returns workspace intelligence for the dashboard
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { analyzeWorkspace } from "@/lib/ai/intelligence"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    let founder_id = user.id
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("user_type").eq("id", user.id).single()

    if (profile?.user_type === "team_member") {
      const { data: tm } = await supabaseAdmin
        .from("team_members").select("founder_id")
        .eq("user_id", user.id).eq("is_active", true).single()
      if (tm?.founder_id) founder_id = tm.founder_id
    }

    const intel = await analyzeWorkspace(founder_id)
    return NextResponse.json(intel)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}