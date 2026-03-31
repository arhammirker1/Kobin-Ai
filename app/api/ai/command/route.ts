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
import { selectModelForRequest } from "@/lib/ai/model-router"
import { NextResponse } from "next/server"

// ── Token estimation helper ─────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function packHistoryByBudget(
  history: Array<{ role: string; content: string }>,
  tokenBudget: number
): Array<{ role: "user" | "assistant"; content: string }> {
  const packed: Array<{ role: "user" | "assistant"; content: string }> = []
  let used = 0
  for (const msg of [...history].reverse()) {
    if (!msg?.content || (msg.role !== "user" && msg.role !== "assistant")) continue
    const msgTokens = estimateTokens(msg.content)
    if (used + msgTokens > tokenBudget) break
    packed.push({ role: msg.role, content: msg.content })
    used += msgTokens
  }
  return packed.reverse()
}

function repairToolArgs(toolName: string, args: Record<string, any>): Record<string, any> {
  const repaired = { ...args }
  if (toolName === "create_task" || toolName === "update_task") {
    if (repaired.vault_file_names && !Array.isArray(repaired.vault_file_names)) {
      repaired.vault_file_names =
        typeof repaired.vault_file_names === "string" ? [repaired.vault_file_names] : []
    }
    if (repaired.external_links && !Array.isArray(repaired.external_links)) {
      repaired.external_links = []
    }
    if (Array.isArray(repaired.external_links)) {
      repaired.external_links = repaired.external_links
        .filter((l: any) => l && typeof l.url === "string" && l.url.trim())
        .map((l: any) => ({ url: l.url, ...(l.label ? { label: l.label } : {}) }))
    }
  }
  if (toolName === "delete_task" && typeof repaired.needs_confirmation !== "boolean") {
    repaired.needs_confirmation = true
  }
  return repaired
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
1. Gather required data with read tools before action tools whenever data is needed
2. For vault files, projects, or team members, resolve exact matches from read results first
3. Prefer a single complete action call with all known parameters
4. Avoid duplicate create calls for the same intent
5. For assignment requests, check team workload before choosing an assignee
6. After actions, confirm exactly what was done
7. Be direct and useful; prioritize execution over ceremony.

## Critical: Single-Action Rule
Each user request = at most ONE create_task / ONE create_project call. Gather everything first with read tools, then act once.
If you need vault files: call get_vault_files → get the exact titles → pass them in vault_file_names when you call create_task.

## Output Rules
- Do not show internal chain-of-thought.
- Do not expose raw tool names in user-facing responses.
- If data is missing, say so clearly and ask a focused follow-up.
- Give concise, executive-quality answers.`

    // ── Build conversation messages ─────────────────────────────────────────
    // Keep as much recent history as fits in a token budget.
    const cappedHistory = packHistoryByBudget(history, 1200)
    const selectedModel = selectModelForRequest({
      intent: "command",
      message,
      historyCount: cappedHistory.length,
    })
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
    console.log(`[AI-CMD] System: ~${systemTokens} tokens | Tools schema: ~${toolSchemaTokens} tokens | History: ${cappedHistory.length} msgs | Model: ${selectedModel.model} (${selectedModel.tier}/${selectedModel.reason})`)

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
          model: selectedModel.model || GROQ_MODEL,
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
              model: selectedModel.model || GROQ_MODEL,
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
              model: selectedModel.model || GROQ_MODEL,
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
          model: selectedModel.model || GROQ_MODEL,
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
        toolArgs = repairToolArgs(toolName, toolArgs)

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
      model: selectedModel.model || GROQ_MODEL,
      messages,
      stream: true,
      max_tokens: 1024,
      temperature: 0.5,
    })

    return createStreamSSEResponse(finalStream, actionEvents)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    console.error("[AI-CMD] Error:", message)
    return NextResponse.json(
      {
        error: "AI command execution failed",
        detail: message,
        degraded_mode: true,
        user_message:
          "I hit a temporary tool execution issue. Please retry, or split the request into smaller actions.",
      },
      { status: 500 }
    )
  }
}
