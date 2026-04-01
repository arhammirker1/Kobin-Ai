import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { GROQ_MODEL } from "@/lib/ai/groq"
import { buildMiniContext } from "@/lib/ai/mini-context"
import { selectModelForRequest } from "@/lib/ai/model-router"
import { NextResponse } from "next/server"
import { QueryEngine } from "@/lib/ai/core/QueryEngine"
import { REGISTERED_TOOLS } from "@/lib/ai/core/RegisterTools"
import type { ActionContext } from "@/lib/ai/action-executor"

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { message, room_id, project_id } = await request.json()
    if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 })

    // Resolve founder_id
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

    // Build mini context
    const miniContext = await buildMiniContext(founderId)

    // Get room info if in a room
    let roomContext = ""
    if (room_id) {
      const { data: room } = await supabaseAdmin
        .from("chat_rooms")
        .select("name, type, project_id")
        .eq("id", room_id)
        .single()

      if (room) {
        roomContext = `\nRoom: ${room.name || room.type}`
        const resolvedProjectId = project_id || room.project_id
        if (resolvedProjectId) {
          const { data: proj } = await supabaseAdmin
            .from("projects")
            .select("name, status")
            .eq("id", resolvedProjectId)
            .single()
          if (proj) roomContext += ` | Project: ${proj.name} (${proj.status})`
        }
      }
    }

    const systemPrompt = `You are the AI assistant in Command Center — an agency OS. You're embedded in the team inbox.
${miniContext}${roomContext}

## RULES
1. No narration. Use tools to look up or manage workspace data.
2. Be conversational but precise.
3. If confirmed an action, give a one-sentence summary.
4. Respond like a polished executive assistant.`

    const selectedModel = selectModelForRequest({
      intent: "chat",
      message,
      historyCount: 1,
    })

    const actionContext: ActionContext = {
      founder_id: founderId,
      user_id: user.id,
      team: [],
      projects: [],
    }

    // Save placeholder message to DB
    const { data: savedMessage } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        room_id,
        sender_id: user.id,
        content: "...",
        is_ai: true,
        ai_model: selectedModel.model || GROQ_MODEL,
        message_type: "ai_response",
      })
      .select("id")
      .single()

    const engine = new QueryEngine({
      conversationId: room_id || user.id,
      model: selectedModel.model || GROQ_MODEL,
      tools: REGISTERED_TOOLS, // FULL ACCESS
      systemPrompt,
    })

    const encoder = new TextEncoder()
    let fullContent = ""

    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send message ID for frontend tracking
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "id", message_id: savedMessage?.id })}\n\n`)
          )

          for await (const chunk of engine.query(message, actionContext)) {
            if (chunk.type === "text") {
              fullContent += chunk.content
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "delta", content: chunk.content })}\n\n`)
              )
            } else if (chunk.type === "action_needed") {
              // Map action_needed to chat-compatible event
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "action_needed", ...chunk })}\n\n`)
              )
            }
          }

          // Final update to DB
          if (savedMessage?.id && fullContent) {
            await supabaseAdmin
              .from("chat_messages")
              .update({ content: fullContent })
              .eq("id", savedMessage.id)
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done", content: fullContent })}\n\n`)
          )
          controller.close()
        } catch (err) {
          console.error("[AI-CHAT] Stream error:", err)
          controller.error(err)
        }
      },
    })

    return new Response(readable, { headers: SSE_HEADERS })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    console.error("[AI-CHAT] Error:", message)
    return NextResponse.json(
      {
        error: "AI chat execution failed",
        detail: message,
        user_message: "I hit a temporary issue. Please retry in a moment.",
      },
      { status: 500 }
    )
  }
}
