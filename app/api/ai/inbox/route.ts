import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGroqClient, GROQ_MODEL } from "@/lib/ai/groq"
import { buildMiniContext } from "@/lib/ai/mini-context"
import { ALL_TOOLS, READ_TOOL_NAMES } from "@/lib/ai/tools"
import { executeReadTool } from "@/lib/ai/mcp-read-tools"
import type { ReadToolName } from "@/lib/ai/mcp-read-tools"
import { executeAction, executeDeleteTaskConfirmed } from "@/lib/ai/action-executor"
import type { AIToolName } from "@/lib/ai/tools"
import type { ActionContext } from "@/lib/ai/action-executor"
import { NextResponse } from "next/server"

// ── Token estimation ────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ── SSE helpers ─────────────────────────────────────────────────────────────

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
}

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

// ── Main POST handler ───────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { message, room_id } = await request.json()
    if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 })

    // Resolve founder
    let founder_id = user.id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_type, full_name")
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

    // ── Load conversation history from DB ───────────────────────────────
    let history: Array<{ role: string; content: string }> = []
    if (room_id) {
      const { data: recentMsgs } = await supabaseAdmin
        .from("chat_messages")
        .select("sender_id, content, is_ai, message_type")
        .eq("room_id", room_id)
        .neq("content", "...")
        .order("created_at", { ascending: false })
        .limit(12)

      if (recentMsgs) {
        // Reverse to chronological; map to role/content
        history = recentMsgs
          .reverse()
          .filter((m) => m.content && m.message_type !== "task_ref" && m.message_type !== "event_invite")
          .map((m) => ({
            role: m.is_ai || m.message_type === "ai_response" ? "assistant" : "user",
            content: m.content,
          }))
          .slice(-10) // Last 10 messages
      }
    }

    // ── Build mini context ──────────────────────────────────────────────
    const miniContext = await buildMiniContext(founder_id)

    const actionContext: ActionContext = {
      founder_id,
      user_id: user.id,
      team: [],
      projects: [],
    }

    const systemPrompt = `You are Kobin — the AI chief of staff inside Command Center, an agency OS. You live in the founder's inbox as a team member they can message anytime. You have full access to their workspace.

${miniContext}

## Your Capabilities
1. **Read** any workspace data: tasks, projects, CRM pipeline, calendar, team workload, vault files, contacts, email intelligence
2. **Execute** actions: create/update/delete tasks, create/update projects
3. **Draft** email replies to CRM contacts with contextual awareness
4. **Scan** for follow-ups: overdue tasks, stale deals, ghosting contacts, upcoming meetings

## How You Work
1. ALWAYS gather ALL needed data with read tools BEFORE executing any action tool
2. If the request mentions vault files, projects, or team members — call the relevant read tools FIRST
3. Then call the action tool ONCE with ALL parameters in a single call
4. NEVER call create_task or create_project more than once for the same request
5. For task assignment, check team workload first via get_team_workload
6. Match names (people, projects, vault files) against data from read tools
7. After actions, confirm what was done with specifics
8. For email drafts, use search_contacts first to understand the relationship context

## Tool Selection — IMPORTANT
- When the user mentions a SPECIFIC PERSON by name, ALWAYS use search_contacts first
- Use get_follow_up_needed when asked "who needs follow-up?", "what's falling through the cracks?", etc.
- Use get_crm_pipeline only for broad pipeline overviews, NOT for info about a specific person
- Use draft_email_reply to generate contextual email drafts

## Critical: Single-Action Rule
Each user request = at most ONE create_task / ONE create_project call. Gather everything first with read tools, then act once.

## Output Rules — NEVER BREAK THESE
- NEVER show your internal reasoning, thinking steps, or planning process
- NEVER reference tool names in your response to the user
- NEVER fabricate or hallucinate data. If you don't have info, say so honestly.
- NEVER narrate what you "would do" — either do it, or give the answer directly.
- Be direct. Founders are busy. No filler. You're their chief of staff.
- Your response must read like a polished final answer from a sharp executive assistant.`

    // ── Build messages array ────────────────────────────────────────────
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(0, -1), // Exclude the last one since it's the same as 'message'
      { role: "user", content: message },
    ]

    // Save placeholder AI message
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

    const groq = getGroqClient()
    const actionEvents: Array<Record<string, any>> = []
    const toolsCalled: string[] = []
    const createActionsExecuted = new Set<string>()

    const systemTokens = estimateTokens(systemPrompt)
    console.log(`[AI-INBOX] System: ~${systemTokens} tokens | History: ${history.length} msgs`)

    // ── Multi-step tool loop (max 4 iterations) ─────────────────────────
    for (let step = 0; step < 4; step++) {
      const inputTokens = estimateTokens(JSON.stringify(messages))
      console.log(`[AI-INBOX] Step ${step + 1} | Input: ~${inputTokens} tokens`)

      let response: any
      try {
        response = await groq.chat.completions.create({
          model: GROQ_MODEL,
          messages,
          tools: ALL_TOOLS as any,
          tool_choice: "auto",
          max_tokens: 1024,
          temperature: 0.4,
        })
      } catch (apiError: any) {
        const errorMessage = apiError?.message || apiError?.error?.message || ""
        if (apiError?.status === 400 && errorMessage.includes("tool_use_failed")) {
          console.log(`[AI-INBOX] Step ${step + 1} | Schema error — retrying with read-only tools`)
          try {
            response = await groq.chat.completions.create({
              model: GROQ_MODEL,
              messages,
              tools: [...ALL_TOOLS].filter((t: any) => READ_TOOL_NAMES.has(t.function.name)) as any,
              tool_choice: "auto",
              max_tokens: 1024,
              temperature: 0.4,
            })
          } catch {
            response = await groq.chat.completions.create({
              model: GROQ_MODEL,
              messages,
              max_tokens: 1024,
              temperature: 0.4,
            })
          }
        } else {
          throw apiError
        }
      }

      const choice = response.choices[0]
      const toolCalls = choice?.message?.tool_calls

      // No tool calls → text response
      if (!toolCalls || toolCalls.length === 0) {
        const content = choice?.message?.content || ""
        console.log(`[AI-INBOX] Step ${step + 1} | No tools → text (${estimateTokens(content)} tokens)`)
        console.log(`[AI-INBOX] Tools used: ${toolsCalled.length > 0 ? toolsCalled.join(", ") : "none"}`)

        // Update saved message in DB
        if (savedMessage?.id) {
          await supabaseAdmin
            .from("chat_messages")
            .update({ content })
            .eq("id", savedMessage.id)
        }

        if (step > 0) {
          // Already have tool context — return pre-built response
          const encoder = new TextEncoder()
          const readable = new ReadableStream({
            start(controller) {
              for (const event of actionEvents) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "action_executed", ...event })}\n\n`)
                )
              }
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
          return new Response(readable, { headers: SSE_HEADERS })
        }

        // First step — stream directly
        const directStream = await groq.chat.completions.create({
          model: GROQ_MODEL,
          messages,
          stream: true,
          max_tokens: 1024,
          temperature: 0.5,
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
        return new Response(readable, { headers: SSE_HEADERS })
      }

      // ── Execute tool calls ────────────────────────────────────────────
      const hasReadCalls = toolCalls.some((tc: any) => READ_TOOL_NAMES.has(tc.function.name))
      const hasActionCalls = toolCalls.some((tc: any) => !READ_TOOL_NAMES.has(tc.function.name))
      const isMixedBatch = hasReadCalls && hasActionCalls

      if (isMixedBatch) {
        console.log(`[AI-INBOX] Step ${step + 1} | Mixed batch — deferring actions`)
      }

      console.log(`[AI-INBOX] Step ${step + 1} | Tools: ${toolCalls.map((tc: any) => tc.function.name).join(", ")}`)

      const toolResults: Array<{ tool_call_id: string; role: "tool"; content: string }> = []

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name
        toolsCalled.push(toolName)

        let toolArgs: Record<string, any> = {}
        try {
          toolArgs = JSON.parse(toolCall.function.arguments)
        } catch {
          toolArgs = {}
        }

        if (READ_TOOL_NAMES.has(toolName)) {
          const result = await executeReadTool(toolName as ReadToolName, toolArgs, founder_id)
          console.log(`[AI-INBOX] Read ${toolName} → ${estimateTokens(result.content)} tokens`)

          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            content: result.content,
          })

          if (result.teamData) actionContext.team = result.teamData
          if (result.projectData) actionContext.projects = result.projectData
        } else {
          // Defer action tools in mixed batches
          if (isMixedBatch) {
            console.log(`[AI-INBOX] Deferred ${toolName}`)
            toolResults.push({
              tool_call_id: toolCall.id,
              role: "tool",
              content: JSON.stringify({
                success: false,
                message: `Deferred: call ${toolName} again in the next step with actual data.`,
              }),
            })
            continue
          }

          // Dedup create actions
          if (toolName === "create_task" || toolName === "create_project") {
            if (createActionsExecuted.has(toolName)) {
              console.log(`[AI-INBOX] BLOCKED duplicate ${toolName}`)
              toolResults.push({
                tool_call_id: toolCall.id,
                role: "tool",
                content: JSON.stringify({
                  success: false,
                  message: `${toolName} already executed. Use update instead.`,
                }),
              })
              continue
            }
            createActionsExecuted.add(toolName)
          }

          // Execute action
          const result = await executeAction(toolName as AIToolName, toolArgs, actionContext)
          console.log(`[AI-INBOX] Action ${toolName} → ${result.success ? "success" : "failed"}`)

          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            content: JSON.stringify(result),
          })

          if (result.success) {
            actionEvents.push({
              tool: toolName,
              ...result.data,
              needs_confirmation: result.needs_confirmation,
              confirmation_action: result.confirmation_action,
            })
          }
        }
      }

      messages.push(choice.message)
      messages.push(...toolResults)
    }

    // ── Max steps exhausted — stream final ───────────────────────────────
    console.log(`[AI-INBOX] Max steps reached, streaming final`)
    console.log(`[AI-INBOX] Tools used: ${toolsCalled.join(", ")}`)

    const finalStream = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      stream: true,
      max_tokens: 1024,
      temperature: 0.5,
    })

    const encoder = new TextEncoder()
    let fullContent = ""
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send action events first
          for (const event of actionEvents) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "action_executed", ...event })}\n\n`)
            )
          }
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
    return new Response(readable, { headers: SSE_HEADERS })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    console.error("[AI-INBOX] Error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
