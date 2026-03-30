import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGroqClient, GROQ_MODEL } from "@/lib/ai/groq"
import { buildMiniContext } from "@/lib/ai/mini-context"
import { READ_TOOLS, executeReadTool } from "@/lib/ai/mcp-read-tools"
import type { ReadToolName } from "@/lib/ai/mcp-read-tools"
import { NextResponse } from "next/server"

// ── Token estimation ────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { message, room_id, project_id } = await request.json()
    if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 })

    // Resolve founder_id
    let founder_id = user.id
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
      if (tm?.founder_id) founder_id = tm.founder_id
    }

    // Build mini context
    const miniContext = await buildMiniContext(founder_id)

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
        // If room has a project, get project name
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

## How You Work
- Use read tools to look up workspace data when relevant to the conversation
- Be conversational but precise. No filler.
- Reference data naturally — don't dump raw tool results
- If asked about tasks, projects, or CRM — use the appropriate read tool first
- Today's date is in the context above.

## Tool Selection — IMPORTANT
- When the user mentions a SPECIFIC PERSON by name (e.g. "Ahmed Khan", "Sarah"), ALWAYS use search_contacts first to get their real data
- Use get_crm_pipeline only for broad pipeline overviews, NOT for info about a specific person
- Use the most SPECIFIC tool available — prefer search_contacts over get_crm_pipeline when a name is mentioned

## Output Rules — NEVER BREAK THESE
- NEVER show your internal reasoning, thinking steps, or planning process (no "Step 1", "Step 2", etc.)
- NEVER reference tool names in your response (no "get_crm_pipeline", "get_deals", etc.)
- NEVER fabricate or hallucinate data. If you don't have info, say so honestly and briefly.
- NEVER narrate what you "would do" — either do it with tools, or give the answer directly.
- Your response must read like a polished final answer from a sharp executive assistant.`

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ]

    const groq = getGroqClient()
    const toolsCalled: string[] = []

    const systemTokens = estimateTokens(systemPrompt)
    const toolSchemaTokens = estimateTokens(JSON.stringify(READ_TOOLS))
    console.log(`[AI-CHAT] System: ~${systemTokens} tokens | Tools schema: ~${toolSchemaTokens} tokens`)

    // Save placeholder message to DB
    const { data: savedMessage } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        room_id,
        sender_id: user.id,
        content: "...",
        is_ai: true,
        ai_model: GROQ_MODEL,
        message_type: "ai_response",
      })
      .select("id")
      .single()

    // ── Multi-step tool loop (max 3 iterations) ──────────────────────────
    for (let step = 0; step < 3; step++) {
      const inputTokens = estimateTokens(JSON.stringify(messages))
      console.log(`[AI-CHAT] Step ${step + 1} | Input: ~${inputTokens} tokens`)

      let response: any
      try {
        response = await groq.chat.completions.create({
          model: GROQ_MODEL,
          messages,
          tools: READ_TOOLS as any,
          tool_choice: "auto",
          max_tokens: 1024,
          temperature: 0.7,
        })
      } catch (apiError: any) {
        // Groq returns 400 when model outputs malformed tool args (e.g. string for boolean)
        const errorMessage = apiError?.message || apiError?.error?.message || ""
        if (apiError?.status === 400 && errorMessage.includes("tool_use_failed")) {
          console.log(`[AI-CHAT] Step ${step + 1} | Groq schema error — retrying without tools`)
          response = await groq.chat.completions.create({
            model: GROQ_MODEL,
            messages,
            max_tokens: 1024,
            temperature: 0.7,
          })
        } else {
          throw apiError
        }
      }

      const choice = response.choices[0]
      const toolCalls = choice?.message?.tool_calls

      if (!toolCalls || toolCalls.length === 0) {
        // No tools — stream final response
        console.log(`[AI-CHAT] Step ${step + 1} | No tools → text response`)
        console.log(`[AI-CHAT] Tools used: ${toolsCalled.length > 0 ? toolsCalled.join(", ") : "none"}`)

        if (step > 0) {
          // Already have tool context — use the generated response
          const content = choice?.message?.content || ""
          // Update DB
          if (savedMessage?.id) {
            await supabaseAdmin
              .from("chat_messages")
              .update({ content })
              .eq("id", savedMessage.id)
          }

          const encoder = new TextEncoder()
          const readable = new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "id", message_id: savedMessage?.id })}\n\n`)
              )
              if (content) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "delta", content })}\n\n`)
                )
              }
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "done", content })}\n\n`)
              )
              controller.close()
            },
          })
          return new Response(readable, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
          })
        }

        // First step, no tools — stream directly
        const directStream = await groq.chat.completions.create({
          model: GROQ_MODEL,
          messages,
          stream: true,
          max_tokens: 1024,
          temperature: 0.7,
        })

        const encoder = new TextEncoder()
        let fullContent = ""
        const readable = new ReadableStream({
          async start(controller) {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "id", message_id: savedMessage?.id })}\n\n`)
              )
              for await (const chunk of directStream) {
                const delta = chunk.choices[0]?.delta?.content || ""
                if (delta) {
                  fullContent += delta
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`)
                  )
                }
              }
              if (savedMessage?.id) {
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
              controller.error(err)
            }
          },
        })
        return new Response(readable, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
        })
      }

      // Execute read tools
      console.log(`[AI-CHAT] Step ${step + 1} | Tools: ${toolCalls.map((tc: any) => tc.function.name).join(", ")}`)

      const toolResults: Array<{ tool_call_id: string; role: "tool"; content: string }> = []

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name as ReadToolName
        toolsCalled.push(toolName)

        let toolArgs: Record<string, any> = {}
        try {
          toolArgs = JSON.parse(toolCall.function.arguments)
        } catch {
          toolArgs = {}
        }

        const result = await executeReadTool(toolName, toolArgs, founder_id)
        console.log(`[AI-CHAT] Read tool ${toolName} → ${estimateTokens(result.content)} tokens`)

        toolResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: result.content,
        })
      }

      messages.push(choice.message)
      messages.push(...toolResults)
    }

    // Exhausted loop — final streaming response
    console.log(`[AI-CHAT] Max steps reached, streaming final`)
    console.log(`[AI-CHAT] Tools used: ${toolsCalled.join(", ")}`)

    const finalStream = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      stream: true,
      max_tokens: 1024,
      temperature: 0.7,
    })

    const encoder = new TextEncoder()
    let fullContent = ""
    const readable = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "id", message_id: savedMessage?.id })}\n\n`)
          )
          for await (const chunk of finalStream) {
            const delta = chunk.choices[0]?.delta?.content || ""
            if (delta) {
              fullContent += delta
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`)
              )
            }
          }
          if (savedMessage?.id) {
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
          controller.error(err)
        }
      },
    })
    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    console.error("[AI-CHAT] Error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}