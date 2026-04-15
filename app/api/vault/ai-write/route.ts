/**
 * app/api/vault/ai-write/route.ts
 *
 * RAG-powered AI writer for vault documents.
 * Retrieves relevant vault context, then streams a completion.
 *
 * Used by the AI Writer panel in the vault doc editor.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { buildVaultRAGContext, type RAGSource } from "@/lib/ai/vault-rag"
import { getGroqClient, GROQ_MODEL_STD } from "@/lib/ai/groq"

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { prompt, documentTitle, documentContent, projectId, mode } =
      await request.json()
    console.log(`[vault/ai-write] prompt="${prompt?.slice(0, 60)}" mode="${mode || "doc"}" project="${projectId || "none"}"`)

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt required" }, { status: 400 })
    }

    // Resolve founder
    let founderId = user.id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_type")
      .eq("id", user.id)
      .single()

    if (profile?.user_type === "team_member") {
      const { data: tm } = await supabaseAdmin
        .from("team_members")
        .select("founder_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single()
      if (tm?.founder_id) founderId = tm.founder_id
    }

    // ── Plan enforcement — AI Writer is Agency only ─────────────────────────
    const { requireFeature } = await import("@/lib/plan-guard")
    const guard = await requireFeature(founderId, "vault_ai_writer")
    if (guard) return guard

    // Retrieve relevant vault context with source attribution
    const { context: vaultContext, sources } = await buildVaultRAGContext(
      founderId,
      `${documentTitle || ""} ${prompt}`,
      { maxItems: 5, projectId }
    )

    const isCodeMode = mode === "code"
    console.log(`[vault/ai-write] isCodeMode=${isCodeMode} | vaultContext items=${sources.length}`)

    const systemPrompt = isCodeMode
      ? `You are an expert software engineer embedded in Kobin AI.
You help edit, refactor, fix, and extend code files.
${vaultContext ? `\n${vaultContext}\n` : ""}
${documentTitle ? `Current file: "${documentTitle}"\nExisting code:\n\`\`\`\n${(documentContent || "").slice(0, 3000)}\n\`\`\`` : ""}

Rules:
- Return ONLY the code — no explanation, no preamble, no markdown fences.
- Match the existing language, style, and indentation exactly.
- If inserting a partial change, return only that changed block unless the whole file is needed.`
      : `You are an expert agency document writer embedded in Kobin AI.
You help founders write professional documents: proposals, briefs, SOPs, reports, and notes.
${vaultContext ? `\n${vaultContext}\n` : ""}
${documentTitle
  ? `Current document: "${documentTitle}"\n${documentContent ? `Existing content:\n${documentContent.slice(0, 1000)}\n\n` : ""}`
  : ""}
Rules:
- Write in clear, professional prose. Be specific and actionable.
- If inserting into an existing document, match its tone and style.
- When you use information from the vault context above, naturally reference the source (e.g. "Based on the proposal..." or "As outlined in the brief...").
- Return ONLY the written content — no preamble, no explanation, no meta-commentary.`

    const groq = getGroqClient()
    const stream = await groq.chat.completions.create({
      model: GROQ_MODEL_STD,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      stream: true,
      max_tokens: 1500,
      temperature: 0.6,
    })

    const enc = new TextEncoder()
    const readable = new ReadableStream({
      async start(ctrl) {
        // Emit sources FIRST so UI can show them immediately
        if (sources.length > 0) {
          ctrl.enqueue(enc.encode(
            `data: ${JSON.stringify({ type: "sources", sources })}\n\n`
          ))
        }

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) {
            ctrl.enqueue(enc.encode(
              `data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`
            ))
          }
        }
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
        ctrl.close()
      },
    })

    return new Response(readable, { headers: SSE_HEADERS })
  } catch (err: any) {
    console.error("[vault/ai-write]", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}