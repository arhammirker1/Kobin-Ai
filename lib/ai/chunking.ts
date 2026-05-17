/**
 * lib/ai/chunking.ts
 *
 * Text chunking for vault RAG.
 * Splits documents into overlapping chunks for fine-grained retrieval.
 * bge-small tokens ≈ 4 chars per token → 800 char chunk ≈ 200 tokens (well within 512 limit).
 */

export interface TextChunk {
  text: string
  index: number
  charStart: number
  charEnd: number
  tokenEstimate: number
}

const CHUNK_SIZE    = 800  // chars ≈ 200 tokens
const CHUNK_OVERLAP = 160  // 20% overlap for context continuity
const MIN_CHUNK_LEN = 60   // discard micro-chunks

/**
 * Split text into overlapping chunks with sentence-boundary snapping.
 */
export function chunkText(
  text: string,
  chunkSize  = CHUNK_SIZE,
  overlap    = CHUNK_OVERLAP
): TextChunk[] {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim()
  if (!cleaned) return []

  // Short doc: single chunk
  if (cleaned.length <= chunkSize) {
    return [{
      text: cleaned,
      index: 0,
      charStart: 0,
      charEnd: cleaned.length,
      tokenEstimate: Math.ceil(cleaned.length / 4),
    }]
  }

  const chunks: TextChunk[] = []
  let start = 0
  let index = 0

  while (start < cleaned.length) {
    let end = Math.min(start + chunkSize, cleaned.length)

    // Snap to sentence / paragraph boundary when not at EOF
    if (end < cleaned.length) {
      const sentenceBreaks = [".\n", "!\n", "?\n", ". ", "! ", "? ", ";\n", "; "]
      let best = -1
      for (const bp of sentenceBreaks) {
        const idx = cleaned.lastIndexOf(bp, end)
        if (idx > start + Math.floor(chunkSize * 0.4) && idx > best) {
          best = idx + bp.length
        }
      }
      // Fall back to word boundary
      if (best === -1) {
        const wb = cleaned.lastIndexOf(" ", end)
        if (wb > start + Math.floor(chunkSize * 0.3)) best = wb + 1
      }
      if (best > start) end = best
    }

    const chunkStr = cleaned.slice(start, end).trim()
    if (chunkStr.length >= MIN_CHUNK_LEN) {
      chunks.push({
        text: chunkStr,
        index,
        charStart: start,
        charEnd: end,
        tokenEstimate: Math.ceil(chunkStr.length / 4),
      })
      index++
    }

    start = end - overlap
    if (start < 0 || start >= cleaned.length) break
  }

  return chunks
}

/**
 * For structured docs (markdown/reports): split by section headers first,
 * then chunk each section. Preserves semantic grouping.
 */
export function chunkStructured(
  text: string,
  chunkSize = CHUNK_SIZE,
  overlap   = CHUNK_OVERLAP
): TextChunk[] {
  // Split on markdown headers (## or ###) or double blank lines
  const sectionPattern = /(?=\n#{1,3} |\n\n\n)/g
  const sections = text.split(sectionPattern).map(s => s.trim()).filter(s => s.length > 30)

  if (sections.length <= 1) return chunkText(text, chunkSize, overlap)

  const all: TextChunk[] = []
  let globalIndex = 0
  for (const section of sections) {
    const sectionChunks = chunkText(section, chunkSize, overlap)
    for (const c of sectionChunks) {
      all.push({ ...c, index: globalIndex++ })
    }
  }
  return all
}

/**
 * Auto-detect whether to use structured or plain chunking based on content.
 */
export function smartChunk(text: string): TextChunk[] {
  const hasHeaders = /\n#{1,3} /.test(text)
  const hasSections = (text.match(/\n\n\n/g) || []).length >= 2
  return (hasHeaders || hasSections)
    ? chunkStructured(text)
    : chunkText(text)
}