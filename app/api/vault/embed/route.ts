/**
 * app/api/vault/embed/route.ts
 *
 * Two modes:
 *  POST { vault_item_id }  → embed a specific item (called after add/edit)
 *  POST { batch: true }    → embed all pending items for the founder (cron use)
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { upsertVaultEmbedding, embedPendingItems } from "@/lib/ai/embeddings"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()

    // Resolve founder
    let founderId = user.id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_type")
      .eq("id", user.id)
      .single()

    if (profile?.user_type === "team_member") {
      const { data: tm } = await supabaseAdmin
        .from("team_members")
        .select("founder_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single()
      if (tm?.founder_id) founderId = tm.founder_id
    }

    // ── Batch mode ─────────────────────────────────────────────────────
    if (body.batch) {
      console.log(`[Vault/Embed] Starting batch embedding for founder: ${founderId}`)
      const count = await embedPendingItems(founderId)
      console.log(`[Vault/Embed] Batch complete: Embedded ${count} items`)
      return NextResponse.json({ embedded: count })
    }

    // ── Single item mode ────────────────────────────────────────────────
    const { vault_item_id } = body
    if (!vault_item_id) {
      return NextResponse.json({ error: "vault_item_id required" }, { status: 400 })
    }

    // Fetch item to build embedding text
    const { data: item } = await supabaseAdmin
      .from("vault_items")
      .select("id, title, description, note_content, link_url, document_type, item_type")
      .eq("id", vault_item_id)
      .eq("founder_id", founderId)
      .single()

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    console.log(`[Vault/Embed] Requesting single embed for item: ${vault_item_id} (${item.title})`)
    await upsertVaultEmbedding(vault_item_id, founderId, item)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("[vault/embed]", err)
    return NextResponse.json(
      { error: err.message || "Embed failed" },
      { status: 500 }
    )
  }
}