import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGroqClient, GROQ_MODEL } from "@/lib/ai/groq"
import { buildMiniContext } from "@/lib/ai/mini-context"
import { selectModelForRequest } from "@/lib/ai/model-router"
import { NextResponse } from "next/server"
import { QueryEngine } from "@/lib/ai/core/QueryEngine"
import { REGISTERED_TOOLS } from "@/lib/ai/core/RegisterTools"
import type { ActionContext } from "@/lib/ai/action-executor"
import { executeDeleteTaskConfirmed } from "@/lib/ai/action-executor"

// ── API Route Handlers ──────────────────────────────────────────────────────

// ── Confirmed delete endpoint ───────────────────────────────────────────────

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { task_id } = await request.json()
    if (!task_id) return NextResponse.json({ error: "task_id required" }, { status: 400 })

    const result = await executeDeleteTaskConfirmed(task_id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── SSE stream helpers ──────────────────────────────────────────────────────

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
}

function createSSEResponse(
  content: string,
  event?: Record<string, any>
): Response {
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    start(controller) {
      if (event) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "event", ...event })}\n\n`)
        )
      }
      if (content) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "delta", content })}\n\n`)
        )
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
      controller.close()
    },
  })
  return new Response(readable, { headers: SSE_HEADERS })
}

function createStreamSSEResponse(
  stream: AsyncIterable<any>,
  actionEvents: Array<Record<string, any>>
): Response {
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for (const event of actionEvents) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "action_executed", ...event })}\n\n`)
          )
        }
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || ""
          if (delta) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`)
            )
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })
  return new Response(readable, { headers: SSE_HEADERS })
}

// ── Main POST handler ───────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { message, conversationId = user.id } = await request.json()
    if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 })

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

    const miniContext = await buildMiniContext(founderId)
    const actionContext: ActionContext = {
      founder_id: founderId,
      user_id: user.id,
      team: [],
      projects: [],
    }

    const systemPrompt = `You are the AI manager for Command Center — an agency OS.
${miniContext}

## RULES
1. No narration. Execute tools silently.
2. One sentence confirmation after actions.
3. Be concise and professional.`

    const selectedModel = selectModelForRequest({
      intent: "command",
      message,
      historyCount: 0, // Engine handles history now
    })

    const engine = new QueryEngine({
      conversationId,
      model: selectedModel.model || GROQ_MODEL,
      tools: REGISTERED_TOOLS,
      systemPrompt,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of engine.query(message, actionContext)) {
            if (chunk.type === "text") {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "delta", content: chunk.content })}\n\n`)
              )
            } else if (chunk.type === "action_needed") {
              const { type: _type, ...eventData } = chunk
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "action_needed", ...eventData })}\n\n`)
              )
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
    })

    return new Response(readable, { headers: SSE_HEADERS })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    console.error("[AI-CMD] Error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
