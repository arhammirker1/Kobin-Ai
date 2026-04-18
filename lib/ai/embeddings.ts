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
  const { smartChunk } = await import("./chunking")
  const chunks = smartChunk(rawText)

  if (chunks.length === 0) return

  // Hard caps — prevents OOM and Vercel timeout on arbitrarily large files.
  // The item-level embedding already makes the document searchable.
  // Chunks add sentence-level precision; first MAX_CHUNKS_PER_RUN are highest priority.
  const MAX_CHUNKS_PER_RUN = 50
  const CHUNK_TIMEOUT_MS = 45_000 // 45s — leaves headroom under Vercel's 60s default

  const chunksToProcess = chunks.slice(0, MAX_CHUNKS_PER_RUN)
  const skipped = chunks.length - chunksToProcess.length

  if (skipped > 0) {
    console.log(
      `[Embed/Chunks] Large doc: ${chunks.length} chunks total, processing first ${MAX_CHUNKS_PER_RUN}. ` +
      `Item-level embedding covers the remaining ${skipped} chunks for broad search.`
    )
  } else {
    console.log(`[Embed/Chunks] Embedding ${chunksToProcess.length} chunks for ${vaultItemId}`)
  }

  const runStart = Date.now()
  let successCount = 0

  // STRICTLY SEQUENTIAL (batch=1) — one HF call + one Supabase upsert at a time.
  // This keeps memory flat regardless of file size. GC runs between iterations.
  for (const chunk of chunksToProcess) {
    // Hard time budget — aborts gracefully before Vercel kills the function
    if (Date.now() - runStart > CHUNK_TIMEOUT_MS) {
      console.warn(
        `[Embed/Chunks] Time budget hit at chunk ${chunk.index}/${chunksToProcess.length} — stopping early. ` +
        `Processed ${successCount} chunks successfully.`
      )
      break
    }

    try {
      const embedding = await generateEmbedding(chunk.text)
      const vectorLiteral = `[${embedding.join(",")}]`

      await supabaseAdmin.from("vault_chunks").upsert(
        {
          vault_item_id: vaultItemId,
          founder_id: founderId,
          chunk_index: chunk.index,
          chunk_text: chunk.text,
          embedding: vectorLiteral,
          token_count: chunk.tokenEstimate,
        },
        { onConflict: "vault_item_id,chunk_index" }
      )
      successCount++
    } catch (err) {
      console.error(`[Embed/Chunks] Failed chunk ${chunk.index} for ${vaultItemId}:`, err)
      // Continue — partial chunk coverage is better than zero coverage
    }

    // Breathing room between calls: lets GC reclaim the previous response buffer
    // and avoids HuggingFace rate limits on rapid sequential requests
    await new Promise(r => setTimeout(r, 150))
  }

  // Only prune stale excess chunks after a full successful run
  if (successCount === chunksToProcess.length) {
    await supabaseAdmin
      .from("vault_chunks")
      .delete()
      .eq("vault_item_id", vaultItemId)
      .gte("chunk_index", chunksToProcess.length)
    console.log(`[Embed/Chunks] ✓ ${successCount} chunks stored atomically for ${vaultItemId}`)
  } else {
    console.warn(`[Embed/Chunks] Partial success (${successCount}/${chunksToProcess.length}) — stale chunks retained`)
  }
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