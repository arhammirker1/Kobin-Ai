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

// ── Token estimation helper ─────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
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

// ── SSE stream helpers ──────────────────────────────────────────────────────

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
}

function createSSEResponse(
  content: string,
  actionEvents: Array<Record<string, any>>
): Response {
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    start(controller) {
      for (const event of actionEvents) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "action_executed", ...event })}\n\n`)
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

    const { message, history = [] } = await request.json()
    if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 })

    // Resolve founder
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

    // ── Build mini context (not the full dump) ─────────────────────────────
    const miniContext = await buildMiniContext(founder_id)

    // Mutable action context — enriched by read tools as they're called
    const actionContext: ActionContext = {
      founder_id,
      user_id: user.id,
      team: [],
      projects: [],
    }

    const systemPrompt = `You are the AI manager for Command Center — an agency OS. You can READ workspace data and EXECUTE actions using tools.

${miniContext}

## How You Work
1. ALWAYS gather ALL needed data with read tools BEFORE executing any action tool
2. If the request mentions vault files, projects, or team members — call the relevant read tools FIRST in step 1
3. Then call the action tool ONCE with ALL parameters (title, assignee, project, vault files, deliverables, links) in a single call
4. NEVER call create_task or create_project more than once for the same request
5. For task assignment, check team workload first via get_team_workload
6. Match names (people, projects, vault files) against data from read tools
7. After actions, confirm what was done with specifics
8. Be direct. Founders are busy. No filler.

## Critical: Single-Action Rule
Each user request = at most ONE create_task / ONE create_project call. Gather everything first with read tools, then act once.
If you need vault files: call get_vault_files → get the exact titles → pass them in vault_file_names when you call create_task.

## Tool Selection — IMPORTANT
- When the user mentions a SPECIFIC PERSON by name (e.g. "Ahmed Khan", "Sarah"), ALWAYS use search_contacts first to get their real data
- Use get_crm_pipeline only for broad pipeline overviews, NOT for info about a specific person
- Use get_workspace_overview for general "how are things going" questions, NOT for person-specific queries
- Use the most SPECIFIC tool available — prefer search_contacts over get_crm_pipeline when a name is mentioned

## Output Rules — NEVER BREAK THESE
- NEVER show your internal reasoning, thinking steps, or planning process (no "Step 1", "Step 2", etc.)
- NEVER reference tool names in your response to the user (no "get_crm_pipeline", "get_tasks", etc.)
- NEVER fabricate or hallucinate data. If you don't have info, say so honestly and briefly.
- NEVER narrate what you "would do" — either do it with tools, or give the answer directly.
- Your response must read like a polished final answer from a sharp executive assistant.`

    // ── Build conversation messages ─────────────────────────────────────────
    // Cap history to last 6 messages to prevent token bloat
    const cappedHistory = history.slice(-6)
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...cappedHistory.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: message },
    ]

    const groq = getGroqClient()
    const actionEvents: Array<Record<string, any>> = []
    const toolsCalled: string[] = []
    const createActionsExecuted = new Set<string>() // Dedup guard for create_task/create_project

    // ── Token logging ─────────────────────────────────────────────────────
    const systemTokens = estimateTokens(systemPrompt)
    const toolSchemaTokens = estimateTokens(JSON.stringify(ALL_TOOLS))
    console.log(`[AI-CMD] System: ~${systemTokens} tokens | Tools schema: ~${toolSchemaTokens} tokens | History: ${cappedHistory.length} msgs`)

    // ── Multi-step tool loop (max 4 iterations) ─────────────────────────────
    // Extra iteration to accommodate: read → defer → action → response
    for (let step = 0; step < 4; step++) {
      const inputTokens = estimateTokens(JSON.stringify(messages))
      console.log(`[AI-CMD] Step ${step + 1} | Input: ~${inputTokens} tokens`)

      // Try ALL_TOOLS first. If Groq returns a 400 schema validation error
      // (model tried to batch reads+actions with template placeholders),
      // retry with read-only tools to force proper sequencing.

      let response: any
      try {
        response = await groq.chat.completions.create({
          model: GROQ_MODEL,
          messages,
          tools: ALL_TOOLS as any,
          tool_choice: "auto",
          max_tokens: 1024,
          temperature: 0.3,
        })
      } catch (apiError: any) {
        // Groq returns 400 when the model outputs malformed tool args
        // (e.g. string "true" for boolean, or template placeholders)
        const errorMessage = apiError?.message || apiError?.error?.message || ""
        if (apiError?.status === 400 && errorMessage.includes("tool_use_failed")) {
          console.log(`[AI-CMD] Step ${step + 1} | Groq schema error — retrying with read-only tools`)
          try {
            response = await groq.chat.completions.create({
              model: GROQ_MODEL,
              messages,
              tools: [...ALL_TOOLS].filter((t: any) => READ_TOOL_NAMES.has(t.function.name)) as any,
              tool_choice: "auto",
              max_tokens: 1024,
              temperature: 0.3,
            })
          } catch (retryError: any) {
            // Read-only retry also failed — fall back to no tools
            console.log(`[AI-CMD] Step ${step + 1} | Read-only retry also failed — falling back to plain response`)
            response = await groq.chat.completions.create({
              model: GROQ_MODEL,
              messages,
              max_tokens: 1024,
              temperature: 0.3,
            })
          }
        } else {
          throw apiError // Re-throw non-schema errors
        }
      }

      const choice = response.choices[0]
      const toolCalls = choice?.message?.tool_calls

      // No tool calls → AI wants to respond with text
      if (!toolCalls || toolCalls.length === 0) {
        const content = choice?.message?.content || ""
        console.log(`[AI-CMD] Step ${step + 1} | No tools → text response (${estimateTokens(content)} tokens)`)
        console.log(`[AI-CMD] Tools used this request: ${toolsCalled.length > 0 ? toolsCalled.join(", ") : "none"}`)

        // If we already have tool results in the conversation, stream a final response
        if (step > 0) {
          return createSSEResponse(content, actionEvents)
        }

        // First step, no tools — stream directly
        const directStream = await groq.chat.completions.create({
          model: GROQ_MODEL,
          messages,
          stream: true,
          max_tokens: 1024,
          temperature: 0.5,
        })
        return createStreamSSEResponse(directStream, actionEvents)
      }

      // ── Detect mixed read+action batches and defer actions ─────────────
      const hasReadCalls = toolCalls.some((tc: any) => READ_TOOL_NAMES.has(tc.function.name))
      const hasActionCalls = toolCalls.some((tc: any) => !READ_TOOL_NAMES.has(tc.function.name))
      const isMixedBatch = hasReadCalls && hasActionCalls

      if (isMixedBatch) {
        console.log(`[AI-CMD] Step ${step + 1} | Mixed batch detected — deferring action tools to next step`)
      }

      // Has tool calls — execute them
      console.log(`[AI-CMD] Step ${step + 1} | Tools: ${toolCalls.map((tc: any) => tc.function.name).join(", ")}`)

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
          // ── Read tool ─────────────────────────────────────────────────
          const result = await executeReadTool(toolName as ReadToolName, toolArgs, founder_id)
          console.log(`[AI-CMD] Read tool ${toolName} → ${estimateTokens(result.content)} tokens`)

          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            content: result.content,
          })

          // Enrich action context from read results
          if (result.teamData) actionContext.team = result.teamData
          if (result.projectData) actionContext.projects = result.projectData
        } else {
          // ── Defer action tools in mixed batches ────────────────────
          // If the model tried to call read + action tools in the same step,
          // skip action tools so the model re-calls them with actual data
          if (isMixedBatch) {
            console.log(`[AI-CMD] Deferred ${toolName} — waiting for read results first`)
            toolResults.push({
              tool_call_id: toolCall.id,
              role: "tool",
              content: JSON.stringify({
                success: false,
                message: `Deferred: read tool results aren't available yet. Call ${toolName} again in the next step with the actual data from read tool results.`,
              }),
            })
            continue
          }

          // ── Deduplication guard for create actions ─────────────────
          if (toolName === "create_task" || toolName === "create_project") {
            if (createActionsExecuted.has(toolName)) {
              console.log(`[AI-CMD] BLOCKED duplicate ${toolName} call`)
              toolResults.push({
                tool_call_id: toolCall.id,
                role: "tool",
                content: JSON.stringify({
                  success: false,
                  message: `${toolName} was already executed in this request. The task/project already exists. Use update_task or update_project to modify it.`,
                }),
              })
              continue
            }
            createActionsExecuted.add(toolName)
          }

          // ── Action tool ───────────────────────────────────────────────
          const result = await executeAction(toolName as AIToolName, toolArgs, actionContext)
          console.log(`[AI-CMD] Action tool ${toolName} → ${result.success ? "success" : "failed"}`)

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

      // Append tool call exchange to conversation
      messages.push(choice.message)
      messages.push(...toolResults)
    }

    // ── Exhausted loop — stream final narration ─────────────────────────────
    console.log(`[AI-CMD] Max steps reached, streaming final response`)
    console.log(`[AI-CMD] Tools used: ${toolsCalled.join(", ")}`)

    const finalStream = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      stream: true,
      max_tokens: 1024,
      temperature: 0.5,
    })

    return createStreamSSEResponse(finalStream, actionEvents)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    console.error("[AI-CMD] Error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
