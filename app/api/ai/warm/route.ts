import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { buildMiniContext } from "@/lib/ai/mini-context"
import { analyzeWorkspace } from "@/lib/ai/intelligence"
import { getOrCreateAIRoom } from "@/lib/ai/proactive"
import { getMemories } from "@/lib/ai/memory"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false })

    let founder_id = user.id
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("user_type").eq("id", user.id).single()

    if (profile?.user_type === "team_member") {
      const { data: tm } = await supabaseAdmin
        .from("team_members").select("founder_id")
        .eq("user_id", user.id).eq("is_active", true).single()
      if (tm?.founder_id) founder_id = tm.founder_id
    }

    // Warm all caches in parallel
    await Promise.all([
      buildMiniContext(founder_id),
      analyzeWorkspace(founder_id),
      getOrCreateAIRoom(founder_id),
      getMemories(founder_id),
    ])

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}