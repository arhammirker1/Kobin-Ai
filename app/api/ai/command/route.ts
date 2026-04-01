import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGroqClient, GROQ_MODEL_STD } from "@/lib/ai/groq"
import { buildMiniContext } from "@/lib/ai/mini-context"
import { ALL_TOOLS, READ_TOOL_NAMES } from "@/lib/ai/tools"
import { executeReadTool } from "@/lib/ai/mcp-read-tools"
import type { ReadToolName } from "@/lib/ai/mcp-read-tools"
import { executeAction, executeDeleteTaskConfirmed } from "@/lib/ai/action-executor"
import type { AIToolName } from "@/lib/ai/tools"
import type { ActionContext, ActionResult } from "@/lib/ai/action-executor"
import { selectModelForRequest } from "@/lib/ai/model-router"
import { bust, CK, setRequestId } from "@/lib/redis"
import { NextResponse } from "next/server"
import { aiLogger, generateRequestId, AIPerformanceTracker } from "@/lib/ai/performance-logger"

// ── Helpers ─────────────────────────────────────────────────────────────────

const EST = (t: string) => Math.ceil(t.length / 4)

function packHistory(
  history: Array<{ role: string; content: string }>,
  budget: number
): Array<{ role: "user" | "assistant"; content: string }> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = []
  let used = 0
  for (const msg of [...history].reverse()) {
    if (!msg?.content || (msg.role !== "user" && msg.role !== "assistant")) continue
    const t = EST(msg.content)
    if (used + t > budget) break
    out.push({ role: msg.role, content: msg.content })
    used += t
  }
  return out.reverse()
}

function repairArgs(toolName: string, args: Record<string, any>): Record<string, any> {
  const r = { ...args }
  if (toolName === "create_task" || toolName === "update_task") {
    if (!r.title && r.task_name)       r.title = r.task_name
    if (!r.notes && r.description)     r.notes = r.description
    if (!r.assigned_to_name && r.assignee) r.assigned_to_name = r.assignee
    if (r.vault_file_names && !Array.isArray(r.vault_file_names))
      r.vault_file_names = typeof r.vault_file_names === "string" ? [r.vault_file_names] : []
    if (r.external_links && !Array.isArray(r.external_links))
      r.external_links = []
    if (typeof r.deliverable_required === "string")
      r.deliverable_required = r.deliverable_required.toLowerCase() === "true"
  }
  if (toolName === "delete_task") {
    if (typeof r.needs_confirmation === "string")
      r.needs_confirmation = r.needs_confirmation.toLowerCase() === "true"
    else r.needs_confirmation = true
  }
  return r
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
}

function sseChunk(data: Record<string, any>) {
  return `data: ${JSON.stringify(data)}\n\n`
}

function makeStream(fn: (ctrl: ReadableStreamDefaultController) => Promise<void>): Response {
  const enc = new TextEncoder()
  const readable = new ReadableStream({
    start(ctrl) {
      fn(ctrl).catch(err => {
        ctrl.enqueue(enc.encode(sseChunk({ type: "error", message: String(err) })))
        ctrl.close()
      })
    },
  })
  return new Response(readable, { headers: SSE_HEADERS })
}

async function groqCall(groq: any, model: string, payload: Record<string, any>, tracker: AIPerformanceTracker) {
  try {
    const start = performance.now()
    const result = await groq.chat.completions.create({ ...payload, model })
    const duration = performance.now() - start
    
    // Estimate tokens
    const inputTokens = EST(JSON.stringify(payload.messages))
    const outputTokens = EST(result.choices[0]?.message?.content || "")
    tracker.logLLMCall(model, inputTokens, outputTokens, duration)
    
    return result
  } catch (err: any) {
    if (String(err?.message || "").toLowerCase().includes("decommissioned")) {
      console.warn(`[CMD] Model ${model} decommissioned, falling back to ${GROQ_MODEL_STD}`)
      return await groq.chat.completions.create({ ...payload, model: GROQ_MODEL_STD })
    }
    throw err
  }
}

// ── Request-level tool memoization ─────────────────────────────────────────────

type ToolMemoKey = string
type ToolMemoValue = { content: string; teamData?: any[]; projectData?: any[] }

function memoKey(toolName: string, args: Record<string, any>): ToolMemoKey {
  return `${toolName}:${JSON.stringify(args)}`
}

function createToolMemoizer(tracker: AIPerformanceTracker) {
  const memo = new Map<ToolMemoKey, Promise<ToolMemoValue>>()
  let hitCount = 0
  let missCount = 0
  
  return {
    async getOrExecute<T extends ToolMemoValue>(
      key: ToolMemoKey,
      executor: () => Promise<T>
    ): Promise<T> {
      if (memo.has(key)) {
        hitCount++
        console.log(`[CMD] 💾 MEMO HIT: ${key}`)
        return memo.get(key) as Promise<T>
      }
      missCount++
      console.log(`[CMD] 💾 MEMO MISS: ${key}`)
      const promise = executor()
      memo.set(key, promise as ToolMemoValue)
      return promise
    },
    getStats() {
      return { hits: hitCount, misses: missCount }
    },
    clear() {
      memo.clear()
    }
  }
}

// ── Confirmed delete (called by frontend after user confirms) ─────────────

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
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── Main POST handler ─────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Generate request ID and initialize performance tracker
  const requestId = generateRequestId()
  const tracker = new AIPerformanceTracker(requestId)
  setRequestId(requestId)

  const overallStart = performance.now()
  tracker.mark("Request received")

  console.log("")
  console.log("═══════════════════════════════════════════════════════════════")
  console.log(`[${requestId}] 🚀 AI COMMAND START`)
  console.log("═══════════════════════════════════════════════════════════════")

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      tracker.logError("Auth", "Unauthorized")
      tracker.printSummary()
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { message, history = [] } = await request.json()
    if (!message?.trim()) {
      tracker.logError("Validation", "Empty message")
      tracker.printSummary()
      return NextResponse.json({ error: "Message required" }, { status: 400 })
    }

    console.log(`[${requestId}] 👤 User: ${user.id}`)
    console.log(`[${requestId}] 💬 Message: "${message.slice(0, 100)}${message.length > 100 ? "..." : ""}"`)
    console.log(`[${requestId}] 📜 History: ${history.length} messages`)

    // Resolve founder
    let founder_id = user.id
    const profileStart = performance.now()
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("user_type").eq("id", user.id).single()

    if (profile?.user_type === "team_member") {
      const { data: tm } = await supabaseAdmin
        .from("team_members").select("founder_id")
        .eq("user_id", user.id).eq("is_active", true).single()
      if (tm?.founder_id) founder_id = tm.founder_id
    }
    tracker.mark("Auth & profile resolution", { userType: profile?.user_type, founderId: founder_id })

    // Build mini context (Redis-cached)
    const miniContextStart = performance.now()
    const miniContext = await buildMiniContext(founder_id)
    const miniContextTime = performance.now() - miniContextStart
    console.log(`[${requestId}] 🗄️ MiniContext built (${miniContextTime.toFixed(0)}ms)`)
    console.log(`[${requestId}] 📊 Context preview:\n${miniContext.slice(0, 200)}...`)

    const actionContext: ActionContext = { founder_id, user_id: user.id, team: [], projects: [] }

    const systemPrompt = `You are the AI manager for Command Center — an agency OS. You execute actions and answer questions about the workspace.

${miniContext}

## TOOL USAGE RULES

1. **Context before action**: Call get_task_creation_context ONCE before create_task or update_task. Then create immediately — do not ask more questions after getting context.
2. **One action per request**: Never call create_task or create_project twice.
3. **Only link what was asked**: If the user did NOT mention a project, do NOT set project_name. If the user did NOT mention an assignee, do NOT set assigned_to_name.
4. **Resolve then act**: Read tools first, action tools second. Never mix in one step.
5. **Brief confirmation**: After an action, confirm in one sentence. No narration.
6. **Max one clarifying question**: If you need info, ask ONE question covering everything you need (title, project, assignee). Never ask the same thing twice.
7. **Act with what you have**: If you have title + project, create the task. Don't wait for optional fields.

## NEW CAPABILITIES
- search_messages: search across ALL rooms/DMs. Use when user asks "what did X say" or "find messages about Y"
- update_deal_stage: move CRM contacts through pipeline
- send_message_to_room: draft+confirm before sending to any room or DM
- analyze_workspace: full intelligence analysis with risks, bottlenecks, priorities. Use for "what matters", "what's at risk", "status report"

- NEVER set vault_file_names unless the user explicitly named a specific file to attach.
- NEVER set deliverable_required=true unless the user explicitly said "require a deliverable" or "they need to submit something".
- NEVER infer vault files from context. Only use them if the user says "attach [filename]".
- NEVER set external_links unless the user gave you a URL.
- When in doubt about an optional field, OMIT IT entirely.

## PARAMETER TYPES
All scalar fields (title, notes, project_name, assigned_to_name) must be plain strings.
vault_file_names must be an array of strings.
deliverable_required must be a boolean.
Never send nested objects for scalar fields.`

    const cappedHistory = packHistory(history, 2000)
    const selected = selectModelForRequest({
      intent: "command",
      message,
      historyCount: cappedHistory.length,
    })

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...cappedHistory,
      { role: "user", content: message },
    ]

    // Log what's being poured to the model
    console.log("")
    console.log(`[${requestId}] 📤 === LLM INPUT ===`)
    console.log(`[${requestId}] 🤖 Model: ${selected.model} (${selected.tier} tier)`)
    console.log(`[${requestId}] 💬 Messages: ${messages.length} total`)
    console.log(`[${requestId}] 📊 System prompt: ${systemPrompt.length} chars`)
    console.log(`[${requestId}] 📊 History packed: ${cappedHistory.length} messages`)
    console.log(`[${requestId}] 🔧 Tools available: ${ALL_TOOLS.length}`)

    const groq = getGroqClient()
    const actionEvents: Array<Record<string, any>> = []
    const createActionsExecuted = new Set<string>()
    let lastActionMessage = ""
    let totalToolTime = 0

    // ── Agentic loop (max 4 steps) ────────────────────────────────────────
    for (let step = 0; step < 4; step++) {
      tracker.mark(`Step ${step + 1} started`)
      console.log("")
      console.log(`[${requestId}] ═══ STEP ${step + 1} ═══`)

      let response: any
      const llmStart = performance.now()
      try {
        tracker.logLLMInput(messages, ALL_TOOLS as any[])
        
        response = await groqCall(groq, selected.model, {
          messages,
          tools: ALL_TOOLS as any,
          tool_choice: "auto",
          max_tokens: 1024,
          temperature: 0.2,
        }, tracker)
      } catch (apiErr: any) {
        const llmTime = performance.now() - llmStart
        tracker.logError(`LLM call step ${step}`, apiErr)
        // Schema validation error from Groq — retry without tools
        const msg = apiErr?.message || ""
        if (apiErr?.status === 400 && msg.includes("tool_use_failed")) {
          console.warn(`[${requestId}] ⚠️ LLM schema error — retrying without tools`)
          response = await groqCall(groq, selected.model, { messages, max_tokens: 800, temperature: 0 }, tracker)
        } else {
          tracker.printSummary()
          throw apiErr
        }
      }
      const llmTime = performance.now() - llmStart
      console.log(`[${requestId}] 🤖 LLM response time: ${llmTime.toFixed(0)}ms`)

      const choice = response.choices[0]
      const toolCalls = choice?.message?.tool_calls

      // No tool calls → text response
      if (!toolCalls || toolCalls.length === 0) {
        const content = choice?.message?.content || ""
        tracker.mark("Text response", { contentLength: content.length })
        console.log(`[${requestId}] 💭 Text response (${content.length} chars)`)

        return makeStream(async (ctrl) => {
          const enc = new TextEncoder()
          // Flush any action events first
          for (const ev of actionEvents) {
            ctrl.enqueue(enc.encode(sseChunk({ type: "action_executed", ...ev })))
          }
          if (content) {
            console.log(`[${requestId}] 📤 Streaming response: "${content.slice(0, 100)}..."`)
            ctrl.enqueue(enc.encode(sseChunk({ type: "delta", content })))
          }
          ctrl.enqueue(enc.encode(sseChunk({ type: "done" })))
          ctrl.close()
        })
      }

      // Has tool calls — execute them
      console.log(`[${requestId}] 🔧 Tools called: ${toolCalls.map((tc: any) => tc.function.name).join(", ")}`)
      tracker.mark("Tool call received", { count: toolCalls.length, tools: toolCalls.map((tc: any) => tc.function.name) })

      // Detect mixed read+action batch — defer action tools
      const hasRead   = toolCalls.some((tc: any) => READ_TOOL_NAMES.has(tc.function.name))
      const hasAction = toolCalls.some((tc: any) => !READ_TOOL_NAMES.has(tc.function.name))
      const isMixed   = hasRead && hasAction

      // Initialize memoizer for this step
      const toolMemo = createToolMemoizer(tracker)
      const toolResults: Array<{ tool_call_id: string; role: "tool"; content: string }> = []

      // Separate read and action tool calls
      const readCalls = toolCalls.filter((tc: any) => READ_TOOL_NAMES.has(tc.function.name))
      const actionCalls = toolCalls.filter((tc: any) => !READ_TOOL_NAMES.has(tc.function.name))

      // ── Execute READ tools in PARALLEL ────────────────────────────────────
      if (readCalls.length > 0) {
        const toolExecStart = performance.now()
        console.log(`[${requestId}] ⚡ Executing ${readCalls.length} read tool(s) in PARALLEL`)

        const readPromises = readCalls.map(async (tc: any) => {
          const toolName = tc.function.name
          let toolArgs: Record<string, any> = {}
          try { toolArgs = JSON.parse(tc.function.arguments) } catch {}
          toolArgs = repairArgs(toolName, toolArgs)

          const key = memoKey(toolName, toolArgs)
          console.log(`[${requestId}] 🔧 → ${toolName}(${JSON.stringify(toolArgs).slice(0, 50)}...)`)

          const execStart = performance.now()
          const result = await toolMemo.getOrExecute(key, () =>
            executeReadTool(toolName as ReadToolName, toolArgs, founder_id)
          )
          const execTime = performance.now() - execStart
          totalToolTime += execTime
          tracker.logToolCall(toolName, execTime, false)

          // Update actionContext with returned data
          if (result.teamData)    actionContext.team     = result.teamData
          if (result.projectData) actionContext.projects = result.projectData

          console.log(`[${requestId}] ✅ ← ${toolName} (${execTime.toFixed(0)}ms, ${result.content.length} chars)`)

          return {
            tool_call_id: tc.id,
            role: "tool" as const,
            content: result.content
          }
        })

        const readResults = await Promise.all(readPromises)
        toolResults.push(...readResults)

        const parallelTime = performance.now() - toolExecStart
        console.log(`[${requestId}] ⚡ Read tools completed in ${parallelTime.toFixed(0)}ms (parallel)`)
        tracker.mark("Read tools execution", { count: readCalls.length, time: parallelTime })
      }

      // ── Execute ACTION tools SEQUENTIALLY (required for state mutations) ──
      for (const tc of actionCalls) {
        const toolName = tc.function.name
        let toolArgs: Record<string, any> = {}
        try { toolArgs = JSON.parse(tc.function.arguments) } catch {}
        toolArgs = repairArgs(toolName, toolArgs)

        const execStart = performance.now()

        if (isMixed) {
          // Defer action tools when mixed with read tools
          console.log(`[${requestId}] ⏸️ Deferred: ${toolName} (mixed batch)`)
          toolResults.push({
            tool_call_id: tc.id, role: "tool",
            content: JSON.stringify({ success: false, message: `Deferred: call ${toolName} again after read results.` }),
          })
        } else {
          // Action tool
          if ((toolName === "create_task" || toolName === "create_project") && createActionsExecuted.has(toolName)) {
            console.log(`[${requestId}] 🚫 BLOCKED duplicate: ${toolName}`)
            toolResults.push({
              tool_call_id: tc.id, role: "tool",
              content: JSON.stringify({ success: false, message: `${toolName} already executed this request.` }),
            })
            continue
          }
          if (toolName === "create_task" || toolName === "create_project") {
            createActionsExecuted.add(toolName)
          }

          console.log(`[${requestId}] ⚡ ACTION: ${toolName}`)
          console.log(`[${requestId}]    Args: ${JSON.stringify(toolArgs).slice(0, 100)}...`)

          const result: ActionResult = await executeAction(toolName as AIToolName, toolArgs, actionContext)
          const execTime = performance.now() - execStart
          totalToolTime += execTime
          tracker.logToolCall(toolName, execTime, false)
          tracker.logAction(toolName, result.success ? "success" : "error", result.message)

          if (result.message) lastActionMessage = result.message
          toolResults.push({ tool_call_id: tc.id, role: "tool", content: JSON.stringify(result) })

          if (result.success) {
            actionEvents.push({
              tool: toolName,
              ...result.data,
              needs_confirmation: result.needs_confirmation,
              confirmation_action: result.confirmation_action,
            })

            console.log(`[${requestId}] ✅ Action success: ${toolName}`)
            if (result.data) {
              console.log(`[${requestId}]    Result data: ${JSON.stringify(result.data).slice(0, 100)}...`)
            }

            // Bust relevant caches after mutations
            if (toolName === "create_task" || toolName === "update_task") {
              console.log(`[${requestId}] 💾 Busting cache: miniContext, teamWorkload`)
              await bust(CK.miniContext(founder_id), CK.teamWorkload(founder_id))
            }
            if (toolName === "create_project" || toolName === "update_project") {
              console.log(`[${requestId}] 💾 Busting cache: miniContext, projects`)
              await bust(CK.miniContext(founder_id), CK.projects(founder_id))
            }
          } else {
            console.log(`[${requestId}] ❌ Action failed: ${toolName} - ${result.message}`)
          }
        }
      }

      messages.push(choice.message)
      messages.push(...toolResults)

      // If we executed an action successfully, stream the result immediately
      if (actionEvents.length > 0 && !isMixed) {
        console.log(`[${requestId}] 📤 Streaming action results (${actionEvents.length} actions)`)
        return makeStream(async (ctrl) => {
          const enc = new TextEncoder()
          for (const ev of actionEvents) {
            ctrl.enqueue(enc.encode(sseChunk({ type: "action_executed", ...ev })))
          }
          ctrl.enqueue(enc.encode(sseChunk({ type: "delta", content: lastActionMessage || "Done." })))
          ctrl.enqueue(enc.encode(sseChunk({ type: "done" })))
          ctrl.close()
        })
      }
    }

    // Exhausted loop — stream final response
    console.log(`[${requestId}] ⚠️ Max steps reached, streaming final response`)

    return makeStream(async (ctrl) => {
      const enc = new TextEncoder()
      const streamStart = performance.now()
      let chunkCount = 0
      
      for (const ev of actionEvents) {
        ctrl.enqueue(enc.encode(sseChunk({ type: "action_executed", ...ev })))
      }
      
      const stream = await groqCall(groq, selected.model, { messages, stream: true, max_tokens: 1024, temperature: 0.5 }, tracker)
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || ""
        if (delta) {
          chunkCount++
          ctrl.enqueue(enc.encode(sseChunk({ type: "delta", content: delta })))
        }
      }
      
      const streamTime = performance.now() - streamStart
      console.log(`[${requestId}] 📡 Stream completed: ${chunkCount} chunks in ${streamTime.toFixed(0)}ms`)
      
      ctrl.enqueue(enc.encode(sseChunk({ type: "done" })))
      ctrl.close()
    })

  } catch (err) {
    const totalTime = performance.now() - overallStart
    tracker.logError("Request failed", err)
    console.error(`[${requestId}] ❌ ERROR: ${err}`)
    console.error(`[${requestId}] Total time before error: ${totalTime.toFixed(0)}ms`)
    tracker.printSummary()
    return NextResponse.json({
      error: "AI command failed",
      user_message: "I hit a temporary issue. Please retry.",
    }, { status: 500 })
  }
}