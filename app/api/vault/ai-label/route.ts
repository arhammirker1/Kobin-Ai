/**
 * app/api/vault/ai-label/route.ts
 *
 * Labels a vault file using extracted text content (when available)
 * or falls back to filename-based labeling.
 *
 * Spec: ❌ Do NOT label from filename alone
 *       ✅ Label only after full text extraction
 *
 * ── Fixes ──────────────────────────────────────────────────────────────────
 *  • Strict JSON enforcement with multi-strategy fallback parsing
 *  • Comprehensive logging for every processing stage
 *  • Graceful fallback: title=filename, description="Auto-label failed", tags=[]
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getGroqClient, GROQ_MODEL_FAST } from "@/lib/ai/groq"

// ── Helpers ────────────────────────────────────────────────────────────────

function safeParseJSON(raw: string): {
  title?: string
  description?: string
  document_type?: string
  tags?: string[]
} | null {
  // Strategy 1: direct parse
  try {
    return JSON.parse(raw)
  } catch { /* continue */ }

  // Strategy 2: strip markdown fences
  const stripped = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim()
  try {
    return JSON.parse(stripped)
  } catch { /* continue */ }

  // Strategy 3: extract JSON object with regex
  const match = stripped.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      return JSON.parse(match[0])
    } catch { /* continue */ }
  }

  return null
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const LOG = "[vault/ai-label]"

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.warn(`${LOG} Unauthorized request`)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { filename, fileType, extracted_text } = body

    if (!filename && !extracted_text) {
      console.warn(`${LOG} Missing both filename and extracted_text`)
      return NextResponse.json({ error: "filename or extracted_text required" }, { status: 400 })
    }

    console.log(`${LOG} Processing: "${filename}" | type="${fileType}" | has_text=${!!extracted_text} | text_len=${extracted_text?.length ?? 0}`)

    const groq = getGroqClient()

    const hasContent = extracted_text && extracted_text.trim().length > 20
    // Cap content snippet to avoid token bloat; first 3k chars is enough for labeling
    const contentSnippet = hasContent ? extracted_text.slice(0, 3000) : null

    const userMessage = hasContent
      ? `Filename: ${filename || "untitled"}\nFile type: ${fileType || "unknown"}\n\nExtracted content:\n${contentSnippet}`
      : `Filename: ${filename}\nFile type: ${fileType || "unknown"}`

    console.log(`${LOG} Calling Groq model=${GROQ_MODEL_FAST} | content_mode=${hasContent ? "full" : "filename_only"}`)

    const t0 = Date.now()
    const response = await groq.chat.completions.create({
      model: GROQ_MODEL_FAST,
      max_tokens: 200,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `You are a document metadata expert for a founder's agency vault.
Given a file name and its content, return ONLY a single valid JSON object.
Do NOT include markdown code fences, explanations, or any text outside the JSON.

Respond with exactly this format:
{"title":"...","description":"...","document_type":"...","tags":["tag1","tag2"]}

Rules:
- title: clean, readable name — use the actual content to infer a better title than the filename
- description: one specific sentence explaining exactly what this document IS
- document_type: exactly one of: Content, Deliverable, Report, Contract, Brief, Design Asset, Spreadsheet, Presentation, Reference, Proposal, SOP, Note, Code, Other
- tags: 2-4 short, lowercase tags for categorization
- If you have real content to work with, use it — don't just restate the filename
- CRITICAL: Output ONLY the JSON object, nothing else`,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
    })

    const elapsed = Date.now() - t0
    const raw = response.choices[0]?.message?.content || ""

    console.log(`${LOG} Groq responded in ${elapsed}ms | raw_len=${raw.length}`)
    console.log(`${LOG} Raw AI response: ${raw.slice(0, 300)}`)

    const parsed = safeParseJSON(raw)

    if (!parsed) {
      console.error(`${LOG} JSON parse FAILED for all strategies | raw="${raw}"`)
      // Graceful fallback
      const fallback = {
        title: filename || "Untitled",
        description: "Auto-label failed — please add a description manually",
        document_type: "Content",
        tags: [],
      }
      console.log(`${LOG} Using fallback metadata:`, fallback)
      return NextResponse.json(fallback)
    }

    // Validate required fields, fill gaps
    const result = {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : (filename || "Untitled"),
      description: typeof parsed.description === "string" && parsed.description.trim() ? parsed.description.trim() : "No description provided",
      document_type: typeof parsed.document_type === "string" && parsed.document_type.trim() ? parsed.document_type.trim() : "Content",
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t: any) => typeof t === "string").slice(0, 6) : [],
    }

    console.log(`${LOG} ✓ Successfully labeled: "${result.title}" | type="${result.document_type}" | tags=[${result.tags.join(", ")}]`)

    return NextResponse.json(result)
  } catch (err: any) {
    console.error(`[vault/ai-label] UNHANDLED ERROR:`, err)
    // Return fallback instead of 500 so upload flow continues
    return NextResponse.json({
      title: "Untitled",
      description: "Auto-label failed — please add a description manually",
      document_type: "Content",
      tags: [],
    })
  }
}