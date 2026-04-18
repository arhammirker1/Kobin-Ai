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
  if (item.item_type) parts.push(`Format: ${item.item_type}`)
  if (item.description) parts.push(`Description: ${item.description}`)

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
  // ── Why this approach ────────────────────────────────────────────────────
  // Old: smartChunk(fullText) → entire chunk array in memory → OOM on large docs
  // New: slice one 1600-char window at a time, embed it, let GC reclaim it,
  //      move to next. Peak memory = 1 chunk object, regardless of doc size.
  //
  // CHUNK_SIZE = 1600 chars ≈ 400 tokens — safely within bge-small's 512 limit.
  // Larger chunks = fewer API calls = more coverage within the 60s timeout.
  //
  // Resume support: if a 200k doc hits the timeout, we mark it pending and the
  // next embed call finds existing chunks and resumes from the last saved index.
  // ────────────────────────────────────────────────────────────────────────

  const CHUNK_SIZE = 1600   // chars ≈ 400 tokens
  const CHUNK_OVERLAP = 200    // prevents sentence splits at chunk boundaries
  const CHUNK_TIMEOUT_MS = 50_000 // 50s — leaves buffer under Vercel's 60s limit

  if (!rawText || rawText.length < 60) return

  const totalLen = rawText.length
  const runStart = Date.now()

  // ── Resume: find the last successfully stored chunk index ─────────────────
  // If a previous run timed out halfway through a 200k doc, we pick up
  // from chunk N+1 instead of restarting from zero.
  const { data: existingChunks } = await supabaseAdmin
    .from("vault_chunks")
    .select("chunk_index")
    .eq("vault_item_id", vaultItemId)
    .order("chunk_index", { ascending: false })
    .limit(1)

  const resumeFromIndex = existingChunks?.[0]?.chunk_index ?? -1
  const resuming = resumeFromIndex >= 0

  // ── Build chunk positions (just numbers, not the text) ───────────────────
  // We never materialise the text for all chunks at once —
  // rawText.slice(start, end) is called inside the loop, one at a time.
  const positions: number[] = []
  let p = 0
  while (p < totalLen) {
    positions.push(p)
    const end = Math.min(p + CHUNK_SIZE, totalLen)
    if (end === totalLen) break
    p = end - CHUNK_OVERLAP
  }

  const totalChunks = positions.length
  const startFrom = resumeFromIndex + 1

  console.log(
    `[Embed/Chunks] ${vaultItemId} — ${totalLen} chars, ` +
    `${totalChunks} chunks, ` +
    `${resuming ? `resuming from chunk ${startFrom}` : "fresh start"}`
  )

  let processedCount = startFrom // already done by previous run(s)

  for (let i = startFrom; i < totalChunks; i++) {
    if (Date.now() - runStart > CHUNK_TIMEOUT_MS) {
      console.warn(
        `[Embed/Chunks] Time budget hit at chunk ${i}/${totalChunks} ` +
        `(${processedCount} stored). Marking pending for resume.`
      )
      // Mark pending so embedPendingItems() or the next manual embed resumes
      await supabaseAdmin
        .from("vault_items")
        .update({ embedding_status: "pending" })
        .eq("id", vaultItemId)
      return
    }

    const start = positions[i]
    const end = Math.min(start + CHUNK_SIZE, totalLen)

    // Slice is O(chunkSize), not O(docSize) — this is the key memory fix
    let chunkText = rawText.slice(start, end)

    // Snap to sentence boundary so chunks don't cut mid-sentence
    if (end < totalLen) {
      const lastBreak = Math.max(
        chunkText.lastIndexOf(".\n"),
        chunkText.lastIndexOf(". "),
        chunkText.lastIndexOf("\n\n")
      )
      if (lastBreak > CHUNK_SIZE * 0.5) {
        chunkText = chunkText.slice(0, lastBreak + 1)
      }
    }
    chunkText = chunkText.trim()
    if (chunkText.length < 60) { processedCount++; continue }

    try {
      const embedding = await generateEmbedding(chunkText)
      const vectorLiteral = `[${embedding.join(",")}]`

      await supabaseAdmin.from("vault_chunks").upsert(
        {
          vault_item_id: vaultItemId,
          founder_id: founderId,
          chunk_index: i,
          chunk_text: chunkText,
          embedding: vectorLiteral,
          token_count: Math.ceil(chunkText.length / 4),
        },
        { onConflict: "vault_item_id,chunk_index" }
      )
      processedCount++
    } catch (err) {
      console.error(`[Embed/Chunks] chunk ${i} failed for ${vaultItemId}:`, err)
      // Non-fatal — skip this chunk, continue
    }

    // 150ms breathing room: lets GC reclaim the HF response before next call
    await new Promise(r => setTimeout(r, 150))
  }

  // ── Fully processed — prune any stale chunks from a previous larger run ──
  await supabaseAdmin
    .from("vault_chunks")
    .delete()
    .eq("vault_item_id", vaultItemId)
    .gte("chunk_index", totalChunks)

  console.log(
    `[Embed/Chunks] ✓ Complete: ${processedCount}/${totalChunks} chunks ` +
    `covering all ${totalLen} chars of ${vaultItemId}`
  )
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