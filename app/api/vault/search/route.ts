/**
 * app/api/vault/search/route.ts
 *
 * Semantic + hybrid search endpoint for the Vault.
 * Used by the search overlay (⌘K) and the AI search bar.
 *
 * POST body: { query, project_id?, item_type?, limit?, mode? }
 * mode: "semantic" | "hybrid" | "keyword"
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { vaultHybridSearch, vaultSemanticSearch } from "@/lib/ai/vault-rag"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { query, project_id, item_type, limit = 12, mode = "hybrid" } =
      await request.json()

    console.log(`[Vault/Search] Query: "${query}" | Mode: ${mode} | Project: ${project_id || "All"}`)

    if (!query?.trim()) {
      return NextResponse.json({ results: [] })
    }

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

    let results: any[]

    // ── Plan enforcement — semantic search requires Pro+ ────────────────────
    const { mode: searchMode = "hybrid" } = { mode }
    if (searchMode !== "keyword") {
      const { requireFeature } = await import("@/lib/plan-guard")
      const guard = await requireFeature(founderId, "vault_semantic_search")
      if (guard) return guard
    }

    if (mode === "semantic") {
      results = await vaultSemanticSearch(founderId, query, {
        limit,
        projectId: project_id,
        itemType: item_type,
      })
    } else if (mode === "keyword") {
      const { data } = await supabaseAdmin
        .from("vault_items")
        .select("id, title, description, item_type, document_type, project_id, created_at")
        .eq("founder_id", founderId)
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(limit)
      results = (data || []).map((i) => ({ ...i, similarity: 0.5 }))
    } else {
      results = await vaultHybridSearch(founderId, query, {
        limit,
        projectId: project_id,
      })
    }

    console.log(`[Vault/Search] ✓ Found ${results.length} matches`)
    return NextResponse.json({ results })
  } catch (err: any) {
    console.error("[vault/search]", err)
    return NextResponse.json(
      { error: err.message || "Search failed" },
      { status: 500 }
    )
  }
}