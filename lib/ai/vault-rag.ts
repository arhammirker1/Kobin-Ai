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
  // Chunk-level retrieval fields
  best_chunk_text?: string    // The most relevant chunk from this document
  matched_chunks?: number     // How many chunks matched
}

export interface RelatedContext {
  item: VaultSearchResult
  reason: string   // "0.91 similarity · same client" etc.
  similarity: number
}

// ── Semantic search ──────────────────────────────────────────────────────────

// ── Semantic search (chunk-aware) ────────────────────────────────────────────

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
  const { limit = 10, threshold = 0.18, projectId, itemType } = options

  console.log(`[RAG/Semantic] Searching for: "${query}"`)
  const queryEmbedding = await generateEmbedding(query)
  const vectorLiteral = `[${queryEmbedding.join(",")}]`

  // ── Try chunk-level search first (higher precision) ───────────────────────
  const { data: chunkHits, error: chunkError } = await supabaseAdmin.rpc(
    "vault_chunk_search",
    {
      p_founder_id: founderId,
      p_embedding: vectorLiteral,
      p_limit: limit * 10,    // larger buffer ensures diverse item coverage
      p_threshold: threshold,
    }
  )

  let itemIdToChunks: Record<string, { bestSim: number; bestText: string; count: number }> = {}
  let useChunks = false

  if (!chunkError && chunkHits && chunkHits.length > 0) {
    useChunks = true
    console.log(`[RAG/Semantic] Chunk search: ${chunkHits.length} hits → deduplicating`)

    // Group by vault_item_id, keep best chunk per item
    for (const hit of chunkHits as Array<{ vault_item_id: string; chunk_text: string; similarity: number }>) {
      const existing = itemIdToChunks[hit.vault_item_id]
      if (!existing || hit.similarity > existing.bestSim) {
        itemIdToChunks[hit.vault_item_id] = {
          bestSim: hit.similarity,
          bestText: hit.chunk_text,
          count: (existing?.count || 0) + 1,
        }
      } else {
        existing.count++
      }
    }
  } else {
    // ── Fall back to item-level search (legacy items without chunks) ──────────
    console.log(`[RAG/Semantic] Falling back to item-level search`)
    const { data: similarities, error } = await supabaseAdmin.rpc(
      "vault_semantic_search",
      { p_founder_id: founderId, p_embedding: vectorLiteral, p_limit: limit * 2, p_threshold: threshold }
    )
    if (error || !similarities?.length) {
      if (error) console.error("[RAG/Semantic] Item-level RPC error:", error)
      return []
    }
    for (const s of similarities) {
      itemIdToChunks[s.vault_item_id] = { bestSim: s.similarity, bestText: "", count: 1 }
    }
  }

  const uniqueItemIds = Object.keys(itemIdToChunks)
  if (uniqueItemIds.length === 0) return []
  console.log(`[RAG/Semantic] ${uniqueItemIds.length} unique items after dedup`)

  // ── Fetch full item details ───────────────────────────────────────────────
  let q = supabaseAdmin
    .from("vault_items")
    .select(`
      id, title, description, item_type, document_type,
      folder_id, project_id, drive_file_url, link_url,
      note_content, added_by_type, created_at, embedding_status
    `)
    .in("id", uniqueItemIds)
    .eq("founder_id", founderId)

  if (projectId) q = q.eq("project_id", projectId)
  if (itemType) q = q.eq("item_type", itemType)

  const { data: items } = await q
  if (!items) return []

  // ── Resolve project + folder names ────────────────────────────────────────
  const pIds = [...new Set(items.map((i) => i.project_id).filter(Boolean))] as string[]
  const fIds = [...new Set(items.map((i) => i.folder_id).filter(Boolean))] as string[]

  const [projectsRes, foldersRes] = await Promise.all([
    pIds.length > 0 ? supabaseAdmin.from("projects").select("id, name").in("id", pIds) : { data: [] },
    fIds.length > 0 ? supabaseAdmin.from("vault_folders").select("id, name").in("id", fIds) : { data: [] },
  ])

  const pMap = Object.fromEntries((projectsRes.data || []).map((p) => [p.id, p.name]))
  const fMap = Object.fromEntries((foldersRes.data || []).map((f) => [f.id, f.name]))

  const rawResults = items.map((item) => {
    const chunkData = itemIdToChunks[item.id]
    return {
      ...item,
      similarity: chunkData?.bestSim || 0,
      best_chunk_text: chunkData?.bestText || undefined,
      matched_chunks: chunkData?.count || 1,
      project_name: item.project_id ? pMap[item.project_id] : undefined,
      folder_name: fMap[item.folder_id],
    }
  }).sort((a, b) => b.similarity - a.similarity)

  // ── Max Marginal Relevance (MMR) ─────────────────────────────────────────
  // Balances relevance to query vs diversity across selected results.
  // λ = 0.7 → 70% relevance, 30% diversity.
  const MMR_LAMBDA = 0.7
  const selected: typeof rawResults = []
  const candidates = [...rawResults]

  while (selected.length < limit && candidates.length > 0) {
    let bestIdx = 0
    let bestScore = -Infinity

    for (let i = 0; i < candidates.length; i++) {
      const relevance = candidates[i].similarity
      // Penalise if already selected an item from the same folder (diversity)
      const maxRedundancy = selected.length === 0 ? 0 : Math.max(
        ...selected.map((s) =>
          s.folder_id === candidates[i].folder_id ? 0.5 : 0
        )
      )
      const score = MMR_LAMBDA * relevance - (1 - MMR_LAMBDA) * maxRedundancy
      if (score > bestScore) { bestScore = score; bestIdx = i }
    }

    selected.push(candidates[bestIdx])
    candidates.splice(bestIdx, 1)
  }

  return selected
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
      p_founder_id: founderId,
      p_limit: limit,
      p_threshold: 0.25,
    }
  )

  if (error || !similarities || similarities.length === 0) {
    if (error) console.error("[RAG/Related] RPC Error:", error)
    return []
  }
  console.log(`[RAG/Related] Found ${similarities.length} items connected to ${vaultItemId}`)

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

// ── Source attribution type ───────────────────────────────────────────────────

export interface RAGSource {
  id: string
  title: string
  document_type: string
  similarity: number
  project_name?: string
  chunk_preview?: string   // first 120 chars of matched chunk
}

export interface RAGContext {
  context: string
  sources: RAGSource[]
}

// ── Build RAG context for AI prompts (with source attribution) ────────────────

export async function buildVaultRAGContext(
  founderId: string,
  userMessage: string,
  options: { maxItems?: number; projectId?: string } = {}
): Promise<RAGContext> {
  const { maxItems = 6, projectId } = options

  try {
    console.log(`[RAG/Context] Building context for: "${userMessage.slice(0, 60)}..."`)

    const results = await vaultSemanticSearch(founderId, userMessage, {
      limit: maxItems,
      threshold: 0.22,
      projectId,
    })

    console.log(`[RAG/Context] ${results.length} items retrieved`)

    if (results.length === 0) return { context: "", sources: [] }

    // ── Entity grounding: extract named entities from query ──────────────────
    // If the query references a specific named subject, only include items that
    // contain that name (prevents cross-domain hallucination).
    const queryEntityPattern = /\b[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*\b/g
    const queryEntities = [...new Set(userMessage.match(queryEntityPattern) || [])]
      .filter(e => e.length > 3) // skip short words like "The"

    const groundedResults = queryEntities.length > 0
      ? results.filter((item) => {
        const haystack = [
          item.title, item.description, item.note_content,
          item.best_chunk_text,
        ].filter(Boolean).join(" ").toLowerCase()

        // Include item if ANY query entity appears in its content
        // OR if similarity is very high (≥0.75 → trust the vector)
        return queryEntities.some(e => haystack.includes(e.toLowerCase())) ||
          item.similarity >= 0.75
      })
      : results

    // If grounding filtered everything out, fall back to top-2 raw results with a caveat
    const finalResults = groundedResults.length > 0 ? groundedResults : results.slice(0, 2)

    const lines: string[] = [
      "## Relevant Knowledge from Your Vault:",
      groundedResults.length === 0
        ? "⚠️ No vault items directly mention the subject — showing closest matches.\n"
        : "Use the following context to answer. Cite the source title when referencing it.\n",
    ]

    const sources: RAGSource[] = []

    for (const item of finalResults) {
      const sim = (item.similarity * 100).toFixed(0)
      const sourceLabel = `[${item.title}]`

      lines.push(`### ${sourceLabel} — ${item.document_type} (${sim}% match)`)

      // Prefer best matched chunk over full content (more precise)
      if (item.best_chunk_text) {
        lines.push(item.best_chunk_text.slice(0, 600))
      } else if (item.note_content) {
        lines.push(item.note_content.slice(0, 500))
      } else if (item.description) {
        lines.push(item.description)
      }

      if (item.project_name) lines.push(`*Project: ${item.project_name}*`)
      lines.push("") // spacer

      sources.push({
        id: item.id,
        title: item.title,
        document_type: item.document_type,
        similarity: item.similarity,
        project_name: item.project_name,
        chunk_preview: item.best_chunk_text?.slice(0, 120) || item.description?.slice(0, 120),
      })
    }

    return { context: lines.join("\n"), sources }
  } catch (err) {
    console.error("[RAG] buildVaultRAGContext error:", err)
    return { context: "", sources: [] }
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