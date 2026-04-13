import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getGroqClient, GROQ_MODEL_FAST } from "@/lib/ai/groq"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { filename, fileType } = await request.json()
    if (!filename) return NextResponse.json({ error: "filename required" }, { status: 400 })

    const groq = getGroqClient()
    const response = await groq.chat.completions.create({
      model: GROQ_MODEL_FAST,
      max_tokens: 150,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You label files for a document vault. Given a filename, return ONLY valid JSON with no markdown or extra text:
{"title":"...","description":"...","document_type":"..."}
Rules:
- title: clean readable name, no extension, no underscores/dashes
- description: one sentence about what this file likely contains
- document_type: exactly one of: Content, Deliverable, Report, Contract, Brief, Design Asset, Spreadsheet, Presentation, Reference, Proposal, SOP, Note, Code, Other`,
        },
        {
          role: "user",
          content: `filename: ${filename}\nmime: ${fileType || "unknown"}`,
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