/**
 * lib/ai/vault-rag.ts
 *
 * Retrieval Augmented Generation for the Vault.
 * Powers:
 *   1. Semantic search  — find items by meaning, not keywords
 *   2. Related context  — show what's connected when you open an item
 *   3. RAG context      — inject vault knowledge into AI prompts
 *   4. Auto-clustering  — group items by concept (for insights)
 */

import { supabaseAdmin } from "@/lib/supabase/admin"
import { generateEmbedding } from "./embeddings"

// ── Types ────────────────────────────────────────────────────────────────────

export interface VaultSearchResult {
  id: string
  title: string
  description: string
  item_type: "file" | "link" | "note"
  document_type: string
  folder_id: string
  project_id: string | null
  drive_file_url: string | null
  link_url: string | null
  note_content: string | null
  added_by_type: "founder" | "team" | "client"
  created_at: string
  embedding_status: string
  similarity: number
  project_name?: string
  folder_name?: string
}

export interface RelatedContext {
  item: VaultSearchResult
  reason: string   // "0.91 similarity · same client" etc.
  similarity: number
}

// ── Semantic search ──────────────────────────────────────────────────────────

export async function vaultSemanticSearch(
  founderId: string,
  query: string,
  options: {
    limit?: number
    threshold?: number
    projectId?: string
    itemType?: string
  } = {}
): Promise<VaultSearchResult[]> {
  const { limit = 10, threshold = 0.20, projectId, itemType } = options

  const queryEmbedding = await generateEmbedding(query)
  const vectorLiteral = `[${queryEmbedding.join(",")}]`

  // Call Supabase RPC for similarity search
  const { data: similarities, error } = await supabaseAdmin.rpc(
    "vault_semantic_search",
    {
      p_founder_id: founderId,
      p_embedding:  vectorLiteral,
      p_limit:      limit * 3, // over-fetch then filter
      p_threshold:  threshold,
    }
  )

  if (error || !similarities || similarities.length === 0) {
    if (error) console.error("[RAG] semantic search error:", error)
    return []
  }

  // Fetch full item details
  const itemIds = similarities.map((s: any) => s.vault_item_id)
  let query2 = supabaseAdmin
    .from("vault_items")
    .select(`
      id, title, description, item_type, document_type,
      folder_id, project_id, drive_file_url, link_url,
      note_content, added_by_type, created_at, embedding_status
    `)
    .in("id", itemIds)
    .eq("founder_id", founderId)

  if (projectId) query2 = query2.eq("project_id", projectId)
  if (itemType)  query2 = query2.eq("item_type", itemType)

  const { data: items } = await query2
  if (!items) return []

  // Build lookup maps for project + folder names
  const pIds = [...new Set(items.map((i) => i.project_id).filter(Boolean))] as string[]
  const fIds = [...new Set(items.map((i) => i.folder_id).filter(Boolean))] as string[]

  const [projectsRes, foldersRes] = await Promise.all([
    pIds.length > 0
      ? supabaseAdmin.from("projects").select("id, name").in("id", pIds)
      : { data: [] },
    fIds.length > 0
      ? supabaseAdmin.from("vault_folders").select("id, name").in("id", fIds)
      : { data: [] },
  ])

  const pMap = Object.fromEntries((projectsRes.data || []).map((p) => [p.id, p.name]))
  const fMap = Object.fromEntries((foldersRes.data || []).map((f) => [f.id, f.name]))

  const simMap = Object.fromEntries(
    similarities.map((s: any) => [s.vault_item_id, s.similarity])
  )

  return items
    .map((item) => ({
      ...item,
      similarity: simMap[item.id] || 0,
      project_name: item.project_id ? pMap[item.project_id] : undefined,
      folder_name: fMap[item.folder_id],
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
}

// ── Related context for a specific vault item ────────────────────────────────

export async function getRelatedContext(
  vaultItemId: string,
  founderId: string,
  limit = 5
): Promise<RelatedContext[]> {
  const { data: similarities, error } = await supabaseAdmin.rpc(
    "vault_related_items",
    {
      p_vault_item_id: vaultItemId,
      p_founder_id:    founderId,
      p_limit:         limit,
      p_threshold:     0.25,
    }
  )

  if (error || !similarities || similarities.length === 0) return []

  const itemIds = similarities.map((s: any) => s.vault_item_id)
  const { data: items } = await supabaseAdmin
    .from("vault_items")
    .select(`
      id, title, description, item_type, document_type,
      folder_id, project_id, drive_file_url, link_url,
      note_content, added_by_type, created_at, embedding_status
    `)
    .in("id", itemIds)
    .eq("founder_id", founderId)

  if (!items) return []

  const simMap = Object.fromEntries(
    similarities.map((s: any) => [s.vault_item_id, s.similarity])
  )

  return items
    .map((item) => {
      const sim = simMap[item.id] || 0
      let reason = `${(sim * 100).toFixed(0)}% similarity`
      if (item.item_type === "note") reason += " · related note"
      if (item.document_type === "Proposal") reason += " · similar proposal"
      if (item.item_type === "file") reason += " · same document type"

      return {
        item: { ...item, similarity: sim },
        reason,
        similarity: sim,
      }
    })
    .sort((a, b) => b.similarity - a.similarity)
}

// ── Build RAG context string for AI prompts ──────────────────────────────────

export async function buildVaultRAGContext(
  founderId: string,
  userMessage: string,
  options: { maxItems?: number; projectId?: string } = {}
): Promise<string> {
  const { maxItems = 5, projectId } = options

  try {
    const results = await vaultSemanticSearch(founderId, userMessage, {
      limit: maxItems,
      threshold: 0.30,
      projectId,
    })

    if (results.length === 0) return ""

    const lines = ["## Relevant Vault Knowledge:"]
    for (const item of results) {
      lines.push(`\n### ${item.title} (${item.document_type} · ${(item.similarity * 100).toFixed(0)}% relevant)`)
      if (item.description) lines.push(item.description)
      if (item.note_content) lines.push(item.note_content.slice(0, 300))
      if (item.project_name) lines.push(`Project: ${item.project_name}`)
    }

    return lines.join("\n")
  } catch (err) {
    console.error("[RAG] buildVaultRAGContext error:", err)
    return ""
  }
}

// ── Hybrid search: combine keyword + semantic ────────────────────────────────

export async function vaultHybridSearch(
  founderId: string,
  query: string,
  options: { limit?: number; projectId?: string } = {}
): Promise<VaultSearchResult[]> {
  const { limit = 10, projectId } = options

  // Run both in parallel
  const [semanticResults, keywordItems] = await Promise.all([
    vaultSemanticSearch(founderId, query, { limit, projectId, threshold: 0.15 }),
    (async () => {
      let q = supabaseAdmin
        .from("vault_items")
        .select(`
          id, title, description, item_type, document_type,
          folder_id, project_id, drive_file_url, link_url,
          note_content, added_by_type, created_at, embedding_status
        `)
        .eq("founder_id", founderId)
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(limit)

      if (projectId) q = q.eq("project_id", projectId)
      const { data } = await q
      return (data || []).map((i) => ({ ...i, similarity: 0.5 }))
    })(),
  ])

  // Merge, deduplicate, rank (semantic wins on tie)
  const seen = new Set<string>()
  const merged: VaultSearchResult[] = []

  for (const item of [...semanticResults, ...keywordItems]) {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      merged.push(item)
    }
  }

  return merged.sort((a, b) => b.similarity - a.similarity).slice(0, limit)
}