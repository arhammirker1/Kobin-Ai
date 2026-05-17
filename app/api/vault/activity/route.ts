/**
 * app/api/vault/activity/route.ts
 *
 * GET  ?item_id=xxx         → fetch activity log for an item (latest 50)
 * POST { vault_item_id, action, details } → append a log entry
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const itemId = searchParams.get("item_id")
    if (!itemId) return NextResponse.json({ error: "item_id required" }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from("vault_activity_logs")
      .select("id, action, details, user_name, created_at")
      .eq("vault_item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("[vault/activity GET]", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ logs: data || [] })
  } catch (err: any) {
    console.error("[vault/activity GET] unhandled:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { vault_item_id, action, details } = await request.json()
    if (!vault_item_id || !action) {
      return NextResponse.json({ error: "vault_item_id and action required" }, { status: 400 })
    }

    // Resolve founder + display name
    let founderId = user.id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, user_type")
      .eq("id", user.id)
      .single()

    const userName = profile?.full_name || user.email || "Unknown"

    if (profile?.user_type === "team_member") {
      const { data: tm } = await supabaseAdmin
        .from("team_members")
        .select("founder_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single()
      if (tm?.founder_id) founderId = tm.founder_id
    }

    // Verify the item belongs to this founder's vault
    const { data: item } = await supabaseAdmin
      .from("vault_items")
      .select("id")
      .eq("id", vault_item_id)
      .eq("founder_id", founderId)
      .single()

    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 })

    const { error } = await supabaseAdmin.from("vault_activity_logs").insert({
      vault_item_id,
      founder_id: founderId,
      user_id: user.id,
      user_name: userName,
      action,
      details: details || {},
    })

    if (error) {
      console.error("[vault/activity POST]", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("[vault/activity POST] unhandled:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}