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

    const systemPrompt = `You are the AI chief of staff for Command Center — an agency OS. You have full read and write access to the founder's workspace. You are sharp, decisive, and never dumb.

${miniContext}

## CRITICAL: create_task vs update_task — READ THIS FIRST
This is the most important decision you make on every request:

**Use update_task when:**
- The user refers to a task that already exists (e.g. "the API integration task", "that task", "this task")
- The user says "assign", "move", "change", "set deadline", "make it due", "add to bucket", "mark as"
- ANY modification to an existing task — assignee, due date, status, bucket, priority, notes

**Use create_task when:**
- The user explicitly says "create", "add a new task", "make a task"
- The task clearly does not exist yet

**NEVER create a task if the user is talking about an existing one. When in doubt → update_task.**

## Conversation Memory — USE IT
The conversation history shows what was just discussed. If the previous message mentioned a task, that is the task the user is referring to now. Do NOT forget context between messages.

Example:
- User: "Assign the API integration task to someone free" → you assigned it
- User: "i want this task to be completed today" → THIS SAME TASK. Use update_task with due_date=today + bucket=today
- User: "add this in today's bucket deadline is 2nd april" → STILL THE SAME TASK. Use update_task with bucket=today + due_date=2026-04-02

## How You Work
1. Check conversation history first — what task/entity is being discussed?
2. Decide: create_task OR update_task (see rules above)
3. Use read tools ONLY if you need data you don't have (team names, project names, vault files)
4. Execute the action ONCE with ALL the parameters needed
5. Confirm what changed, be specific

## Bucket Rules
- bucket="today" → task appears in Today view
- bucket="this-week" → task appears in This Week view  
- bucket="delegated" → task is assigned to someone else
- bucket="backlog" → no urgency
- If user says "today's bucket" or "do today" → bucket=today
- due_date and bucket are SEPARATE fields — always set both when mentioned

## Tool Selection
- Existing task mentioned → get_tasks first to confirm it exists, then update_task
- New task → create_task (after getting team/project data if needed)
- Specific person mentioned → search_contacts or get_team_workload
- "who's free" / "lightest workload" → get_team_workload
- Broad overview → get_workspace_overview
- NEVER use get_crm_pipeline for a specific person

## update_task Parameters — ALL PLAIN STRINGS
- task_title: the title to search for (fuzzy match) e.g. "API integration"
- assigned_to_name: person's name as plain string e.g. "Ahmed"
- due_date: ISO string e.g. "2026-04-02T23:59:00"
- bucket: one of "today", "this-week", "delegated", "backlog"
- status: one of "todo", "in-progress", "blocked", "completed"
- priority: one of "low", "medium", "high", "urgent"

## Output Rules — NEVER BREAK
- ALL parameter values must be plain strings — NEVER objects or nested structures
- NEVER show reasoning, steps, or planning process
- NEVER mention tool names to the user
- NEVER hallucinate data
- NEVER re-assign or re-create something already done in this conversation
- Be direct. One crisp confirmation sentence after acting. No filler.`

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
        const errorMessage = apiError?.message || apiError?.error?.message || ""
        console.error(`[AI-CMD] Step ${step + 1} | API error status=${apiError?.status} message=${errorMessage}`)
        console.error(`[AI-CMD] Full error:`, JSON.stringify(apiError?.error || apiError, null, 2))
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
            const retryMessage = retryError?.message || retryError?.error?.message || ""
            console.error(`[AI-CMD] Step ${step + 1} | Read-only retry failed status=${retryError?.status} message=${retryMessage}`)
            console.error(`[AI-CMD] Read-only retry full error:`, JSON.stringify(retryError?.error || retryError, null, 2))
            response = await groq.chat.completions.create({
              model: GROQ_MODEL,
              messages,
              max_tokens: 1024,
              temperature: 0.3,
            })
          }
        } else {
          throw apiError
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
