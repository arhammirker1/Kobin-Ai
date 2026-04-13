/**
 * app/api/vault/ai-label/route.ts
 *
 * Labels a vault file using extracted text content (when available)
 * or falls back to filename-based labeling.
 *
 * Spec: ❌ Do NOT label from filename alone
 *       ✅ Label only after full text extraction
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getGroqClient, GROQ_MODEL_FAST } from "@/lib/ai/groq"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { filename, fileType, extracted_text } = await request.json()
    if (!filename && !extracted_text) {
      return NextResponse.json({ error: "filename or extracted_text required" }, { status: 400 })
    }

    const groq = getGroqClient()

    // Build prompt — richer when we have real content
    const hasContent = extracted_text && extracted_text.trim().length > 20
    const contentSnippet = hasContent
      ? extracted_text.slice(0, 3000)
      : null

    const userMessage = hasContent
      ? `Filename: ${filename || "untitled"}\nFile type: ${fileType || "unknown"}\n\nExtracted content:\n${contentSnippet}`
      : `Filename: ${filename}\nFile type: ${fileType || "unknown"}`

    const response = await groq.chat.completions.create({
      model: GROQ_MODEL_FAST,
      max_tokens: 200,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are a document metadata expert for a founder's agency vault. 
Given a file name and its content, return ONLY valid JSON with no markdown or extra text:
{"title":"...","description":"...","document_type":"...","tags":["tag1","tag2"]}

Rules:
- title: clean, readable name — use the actual content to infer a better title than the filename
- description: one specific sentence explaining exactly what this document IS (not what it "seems to be")
- document_type: exactly one of: Content, Deliverable, Report, Contract, Brief, Design Asset, Spreadsheet, Presentation, Reference, Proposal, SOP, Note, Code, Other
- tags: 2-4 short, lowercase tags for categorization
- If you have real content to work with, use it — don't just restate the filename`,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
    })

    const text = response.choices[0]?.message?.content || ""
    const clean = text.replace(/```json|```/g, "").trim()
    const parsed = JSON.parse(clean)

    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error("[vault/ai-label]", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}