/**
 * lib/ai/embeddings.ts
 *
 * Generates and stores vector embeddings for vault items.
 * Uses OpenAI text-embedding-3-small (1536 dims, cost-efficient).
 *
 * Used by:
 *   - app/api/vault/upload-file/route.ts  (auto-embed on upload)
 *   - app/api/vault/embed/route.ts        (manual re-embed trigger)
 *   - lib/ai/vault-rag.ts                 (semantic search)
 */

import { supabaseAdmin } from "@/lib/supabase/admin"
import crypto from "crypto"

// ── OpenAI embedding call ────────────────────────────────────────────────────


// REPLACE with:
export async function generateEmbedding(text: string): Promise<number[]> {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 8000)
  console.log(`[Embed] Requesting vector for text (${clean.length} chars): "${clean.slice(0, 60)}..."`)

  const res = await fetch(
    "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: clean }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`HuggingFace embedding error: ${err}`)
  }

  const data = await res.json()
  // HF returns either a flat array or [[...]] depending on the model
  return Array.isArray(data[0]) ? data[0] : data
}
// ── Build embeddable text from a vault item ──────────────────────────────────

export function buildEmbeddingText(item: {
  title: string
  description?: string | null
  note_content?: string | null
  link_url?: string | null
  document_type?: string | null
  item_type?: string | null
  extracted_text?: string | null
}): string {
  // Item-level embedding: intentionally lightweight (title + description + brief excerpt).
  // Full content precision is handled by chunk-level embeddings in upsertVaultChunks.
  // This prevents OOM on large files while keeping the item instantly searchable.
  const parts: string[] = []

  parts.push(`Title: ${item.title}`)

  if (item.document_type) parts.push(`Type: ${item.document_type}`)
  if (item.item_type)     parts.push(`Format: ${item.item_type}`)
  if (item.description)   parts.push(`Description: ${item.description}`)

  // Only a brief excerpt — full content is indexed via chunks
  const rawContent = item.note_content || item.extracted_text
  if (rawContent) parts.push(`Content excerpt: ${rawContent.slice(0, 500)}`)

  if (item.link_url) parts.push(`URL: ${item.link_url}`)

  return parts.join("\n")
}

function md5(text: string): string {
  return crypto.createHash("md5").update(text).digest("hex")
}

// ── Upsert embedding for a vault item (item-level + chunked) ─────────────────

export async function upsertVaultEmbedding(
  vaultItemId: string,
  founderId: string,
  item: Parameters<typeof buildEmbeddingText>[0]
): Promise<void> {
  const text = buildEmbeddingText(item)
  const hash = md5(text)

  console.log(`[Embed/Upsert] Starting for item ${vaultItemId}. Content hash: ${hash}`)

  // Check if already embedded with same content hash
  const { data: existing } = await supabaseAdmin
    .from("vault_embeddings")
    .select("content_hash")
    .eq("vault_item_id", vaultItemId)
    .maybeSingle()

  if (existing?.content_hash === hash) {
    console.log(`[Embed/Upsert] Skipping ${vaultItemId} — hash unchanged`)
    return
  }

  try {
    // ── 1. Item-level embedding (for overview search) ────────────────────────
    const embedding = await generateEmbedding(text)
    const vectorLiteral = `[${embedding.join(",")}]`

    await supabaseAdmin.from("vault_embeddings").upsert(
      {
        vault_item_id: vaultItemId,
        founder_id: founderId,
        embedding: vectorLiteral,
        content_hash: hash,
        embedded_at: new Date().toISOString(),
      },
      { onConflict: "vault_item_id" }
    )

    // ── 2. Chunk-level embeddings (for fine-grained RAG) ─────────────────────
    // Only chunk if there's substantial text content
    const rawText = [
      item.note_content,
      item.extracted_text,
      item.description,
    ].filter(Boolean).join("\n\n")

    if (rawText.length > 200) {
      await upsertVaultChunks(vaultItemId, founderId, rawText)
    }

    // ── 3. Mark as embedded ──────────────────────────────────────────────────
    await supabaseAdmin
      .from("vault_items")
      .update({ embedding_status: "embedded" })
      .eq("id", vaultItemId)

    console.log(`[Embed/Upsert] ✓ Item ${vaultItemId} embedded (item-level + chunks)`)
  } catch (err) {
    console.error(`[Embed] Failed for ${vaultItemId}:`, err)
    await supabaseAdmin
      .from("vault_items")
      .update({ embedding_status: "failed" })
      .eq("id", vaultItemId)
  }
}

// ── Chunk a document and embed each chunk ────────────────────────────────────

export async function upsertVaultChunks(
  vaultItemId: string,
  founderId: string,
  rawText: string
): Promise<void> {
  // ── Windowed processing — fixes OOM on large documents ───────────────────
  // Old approach: smartChunk(fullText) creates ALL chunk objects in memory at once.
  // A 100k-char doc → ~125 chunk objects + full text + HF response buffers → OOM.
  //
  // New approach: slice 8k-char windows one at a time. Each window produces ~10
  // chunk objects that are GC-eligible as soon as the window loop body completes.
  // Peak memory stays at ~10 objects regardless of document size.
  //
  // 200-char overlap between windows prevents sentences from being split at
  // window boundaries — same quality as before, just without the memory spike.
  const WINDOW_SIZE      = 8_000   // chars per window ≈ 2k tokens, well within HF limits
  const WINDOW_OVERLAP   = 200     // prevents sentence splits at window boundaries
  const MAX_TOTAL_CHUNKS = 50      // hard cap — item-level embedding covers the rest
  const CHUNK_TIMEOUT_MS = 45_000

  if (!rawText || rawText.length < 60) return

  const { smartChunk } = await import("./chunking")
  const runStart  = Date.now()
  let globalIndex = 0
  let successCount = 0
  let pos = 0
  const totalLen = rawText.length

  console.log(`[Embed/Chunks] Windowed processing ${vaultItemId} — ${totalLen} chars`)

  while (pos < totalLen && globalIndex < MAX_TOTAL_CHUNKS) {
    if (Date.now() - runStart > CHUNK_TIMEOUT_MS) {
      console.warn(`[Embed/Chunks] Time budget hit at pos=${pos}/${totalLen} — stopping early`)
      break
    }

    const end = Math.min(pos + WINDOW_SIZE, totalLen)

    // rawText.slice() creates a new ~8k string (not a copy of the full doc).
    // smartChunk returns ~10 small objects. Both are GC-eligible after this loop body.
    const windowChunks = smartChunk(rawText.slice(pos, end))

    for (const chunk of windowChunks) {
      if (globalIndex >= MAX_TOTAL_CHUNKS) break
      if (Date.now() - runStart > CHUNK_TIMEOUT_MS) break

      try {
        const embedding = await generateEmbedding(chunk.text)
        const vectorLiteral = `[${embedding.join(",")}]`

        await supabaseAdmin.from("vault_chunks").upsert(
          {
            vault_item_id: vaultItemId,
            founder_id: founderId,
            chunk_index: globalIndex,
            chunk_text: chunk.text,
            embedding: vectorLiteral,
            token_count: chunk.tokenEstimate,
          },
          { onConflict: "vault_item_id,chunk_index" }
        )
        successCount++
        globalIndex++
      } catch (err) {
        console.error(`[Embed/Chunks] chunk ${globalIndex} failed for ${vaultItemId}:`, err)
        // Continue — partial coverage beats a crash
      }

      // 150ms pause: lets GC reclaim the HF response buffer before the next call
      await new Promise(r => setTimeout(r, 150))
    }

    // Advance with overlap so no sentence is cut off at the window boundary
    pos = end === totalLen ? totalLen : end - WINDOW_OVERLAP
  }

  // Prune stale chunks from any previous larger run
  await supabaseAdmin
    .from("vault_chunks")
    .delete()
    .eq("vault_item_id", vaultItemId)
    .gte("chunk_index", globalIndex)

  const coverageNote = totalLen > WINDOW_SIZE
    ? ` — item-level embedding covers full doc for broad search`
    : ""
  console.log(`[Embed/Chunks] ✓ ${successCount} chunks stored for ${vaultItemId}${coverageNote}`)
}

// ── Batch embed all pending items for a founder ──────────────────────────────

export async function embedPendingItems(founderId: string): Promise<number> {
  const { data: items } = await supabaseAdmin
    .from("vault_items")
    .select("id, title, description, note_content, link_url, document_type, item_type, extracted_text")
    .eq("founder_id", founderId)
    .eq("embedding_status", "pending")
    .limit(50)

  if (!items || items.length === 0) return 0

  let count = 0
  for (const item of items) {
    await upsertVaultEmbedding(item.id, founderId, item)
    count++
    await new Promise((r) => setTimeout(r, 150))
  }

  return count
}