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
  const parts: string[] = []

  parts.push(`Title: ${item.title}`)

  if (item.document_type) parts.push(`Type: ${item.document_type}`)
  if (item.item_type)     parts.push(`Format: ${item.item_type}`)
  if (item.description)   parts.push(`Description: ${item.description}`)
  if (item.note_content)  parts.push(`Content: ${item.note_content?.slice(0, 4000)}`)
  if (item.link_url)      parts.push(`URL: ${item.link_url}`)
  // Full document content — makes semantic search NotebookLM-level
  if (item.extracted_text) {
    parts.push(`\nDocument Content:\n${item.extracted_text.slice(0, 6000)}`)
  }

  return parts.join("\n")
}

function md5(text: string): string {
  return crypto.createHash("md5").update(text).digest("hex")
}

// ── Upsert embedding for a vault item ───────────────────────────────────────

export async function upsertVaultEmbedding(
  vaultItemId: string,
  founderId: string,
  item: Parameters<typeof buildEmbeddingText>[0]
): Promise<void> {
  const text = buildEmbeddingText(item)
  const hash = md5(text)

  console.log(`[Embed/Upsert] Starting for item ${vaultItemId}. Content hash: ${hash}`)

  // Check if already embedded with same content
  const { data: existing } = await supabaseAdmin
    .from("vault_embeddings")
    .select("content_hash")
    .eq("vault_item_id", vaultItemId)
    .maybeSingle()

  if (existing?.content_hash === hash) {
    console.log(`[Embed/Upsert] Skipping ${vaultItemId} — hash matches existing embedding`)
    return
  }

  try {
    const embedding = await generateEmbedding(text)

    // Store as a Postgres vector literal: '[0.1, 0.2, ...]'
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

    // Update embedding status on the item
    await supabaseAdmin
      .from("vault_items")
      .update({ embedding_status: "embedded" })
      .eq("id", vaultItemId)

    console.log(`[Embed/Upsert] ✓ Successfully stored vector for ${vaultItemId} in Supabase`)
  } catch (err) {
    console.error(`[Embed] Failed for ${vaultItemId}:`, err)

    await supabaseAdmin
      .from("vault_items")
      .update({ embedding_status: "failed" })
      .eq("id", vaultItemId)
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
    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 100))
  }

  return count
}