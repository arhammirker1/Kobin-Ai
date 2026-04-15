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
import { bust, CK } from "@/lib/redis"
import { buildMemoryContext, learnFromAction } from "@/lib/ai/memory"
import { NextResponse } from "next/server"
import { resolvePlanContext } from "@/lib/plan-guard"
import { getPlanLimits } from "@/lib/plans"

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
  "Cache-Control": "no-cache, no-transform",
  "Connection": "keep-alive",
  // Disable compression — gzip buffering kills SSE streaming
  "Content-Encoding": "none",
  "X-Accel-Buffering": "no",
}

function sseChunk(data: Record<string, any>) {
  const json = JSON.stringify(data)
  // Pad to 256 bytes minimum so Node's TCP buffer flushes immediately.
  // SSE clients ignore comment lines (": padding...")
  const msg = `data: ${json}\n\n`
  const padNeeded = Math.max(0, 256 - msg.length)
  const pad = padNeeded > 0 ? `: ${" ".repeat(padNeeded)}\n\n` : ""
  return pad + msg
}

// ── Human-readable tool status labels ───────────────────────────────────────

const READ_TOOL_LABELS: Record<string, string> = {
  get_workspace_overview:    "Scanning your workspace…",
  get_tasks:                 "Reading your tasks…",
  get_projects:              "Loading projects…",
  get_team_workload:         "Checking team workload…",
  get_crm_pipeline:          "Reviewing CRM pipeline…",
  get_calendar:              "Checking your calendar…",
  get_vault_files:           "Browsing vault files…",
  get_task_creation_context: "Gathering context…",
  search_contacts:           "Looking up contact…",
  get_meeting_notes:         "Fetching meeting notes…",
  analyze_workspace:         "Analyzing workspace…",
  vault_semantic_search:     "Searching vault semantically…",
}

const ACTION_TOOL_LABELS: Record<string, string> = {
  create_task:          "Creating task…",
  update_task:          "Updating task…",
  delete_task:          "Finding task to delete…",
  create_project:       "Creating project…",
  update_project:       "Updating project…",
  search_messages:      "Searching messages…",
  update_deal_stage:    "Updating deal stage…",
  send_message_to_room: "Preparing message…",
  analyze_workspace:    "Running workspace analysis…",
}

async function groqCall(groq: any, model: string, payload: Record<string, any>) {
  try {
    return await groq.chat.completions.create({ ...payload, model })
  } catch (err: any) {
    if (String(err?.message || "").toLowerCase().includes("decommissioned")) {
      console.warn(`[CMD] Model ${model} decommissioned, falling back to ${GROQ_MODEL_STD}`)
      return await groq.chat.completions.create({ ...payload, model: GROQ_MODEL_STD })
    }
    throw err
  }
}

// ── Request-level tool memoization ──────────────────────────────────────────

type ToolMemoKey = string
type ToolMemoValue = { content: string; teamData?: any[]; projectData?: any[] }

function memoKey(toolName: string, args: Record<string, any>): ToolMemoKey {
  return `${toolName}:${JSON.stringify(args)}`
}

function createToolMemoizer() {
  const memo = new Map<ToolMemoKey, Promise<ToolMemoValue>>()
  return {
    async getOrExecute<T extends ToolMemoValue>(
      key: ToolMemoKey,
      executor: () => Promise<T>
    ): Promise<T> {
      if (memo.has(key)) {
        console.log(`[MEMO] Cache hit: ${key}`)
        return memo.get(key) as Promise<T>
      }
      const promise = executor()
      memo.set(key, promise as unknown as Promise<ToolMemoValue>)
      return promise
    },
    clear() { memo.clear() },
  }
}

// ── Safe final text generator ────────────────────────────────────────────────
// Root cause: Groq throws "Tool choice is none, but model called a tool" during
// streaming when tool history exists in the message array. Fix strategy:
//   • No tool history in messages → stream directly, no tools needed (safe)
//   • Has tool history → non-streaming call (Groq validates history correctly),
//     yield content as a single chunk so all call sites can `for await` uniformly
async function* streamFinalText(
  groq: any,
  model: string,
  messages: any[],
  opts: { max_tokens: number; temperature: number }
): AsyncGenerator<string> {
  const hasToolHistory = messages.some(
    (m) =>
      (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) ||
      m.role === "tool"
  )

  if (!hasToolHistory) {
    // Clean path — no tool history, stream freely without tools
    const stream = await groqCall(groq, model, {
      ...opts,
      messages,
      stream: true,
    })
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield delta
    }
    return
  }

  // Tool history present — Groq requires tools in payload for message validation.
  // Use non-streaming to avoid the streaming "tool_choice:none + model calls tool" crash.
  let resp: any
  try {
    resp = await groqCall(groq, model, {
      ...opts,
      messages,
      tools: ALL_TOOLS,
      tool_choice: "none",
    })
  } catch (err: any) {
    // Final fallback: strip tool history and regenerate from system + last user msg
    console.warn("[CMD/streamFinalText] tool_choice:none rejected — retrying with stripped history:", err?.message)
    const systemMsg = messages.find((m) => m.role === "system")
    const userMessages = messages.filter((m) => m.role === "user")
    const lastUser = userMessages[userMessages.length - 1]
    resp = await groqCall(groq, model, {
      ...opts,
      messages: [systemMsg, lastUser].filter(Boolean),
    })
  }

  const content: string = resp?.choices?.[0]?.message?.content ?? ""
  if (content) yield content
}

// ── Confirmed delete handler ─────────────────────────────────────────────────

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

// ── Main POST handler ────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let bodyParsed: any
  try {
    bodyParsed = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { message, history = [] } = bodyParsed
  if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 })

  // ── Resolve founder ────────────────────────────────────────────────────────
  let founder_id = user.id
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("user_type").eq("id", user.id).single()

  if (profile?.user_type === "team_member") {
    const { data: tm } = await supabaseAdmin
      .from("team_members").select("founder_id")
      .eq("user_id", user.id).eq("is_active", true).single()
    if (tm?.founder_id) founder_id = tm.founder_id
  }

  // ── Plan enforcement ──────────────────────────────────────────────────────
  const planCtx = await resolvePlanContext(founder_id)
  if (!planCtx.limits.ai_command_bar) {
    return NextResponse.json(
      {
        error: "plan_limit",
        feature: "ai_command_bar",
        required_plan: "pro",
        message: "The AI Command Bar requires a Pro or Agency plan.",
      },
      { status: 403 }
    )
  }

  // Filter tools based on plan — agency-only tools are stripped for pro
  const planFilteredTools = ALL_TOOLS.filter((tool: any) => {
    const name = tool.function.name
    if (name === "vault_semantic_search" && !planCtx.limits.ai_command_bar_vault_search) return false
    if (name === "get_meeting_notes" && !planCtx.limits.ai_command_bar_meeting_notes) return false
    return true
  })

  // ── Build context (both Redis-cached, run in parallel) ────────────────────
  const [miniContext, memoryContext] = await Promise.all([
    buildMiniContext(founder_id),
    buildMemoryContext(founder_id),
  ])

  const actionContext: ActionContext = { founder_id, user_id: user.id, team: [], projects: [] }

  const systemPrompt = `You are the AI manager for Kobin Ai — an agency OS. You execute actions and answer questions about the workspace.

${miniContext}
${memoryContext ? `\n${memoryContext}` : ""}

## VAULT = YOUR PRIMARY KNOWLEDGE BASE (NotebookLM behavior)
The Vault contains the founder's uploaded documents — SOPs, reports, proposals, contracts, metrics, and any other files. Rules that are NON-NEGOTIABLE:
- User asks about a metric, rate, figure, or any business data → call vault_semantic_search IMMEDIATELY before answering
- User asks about a document, report, proposal, contract, or SOP → vault_semantic_search first
- User asks "what does X say", "find Y", "what's our Z" → vault_semantic_search first  
- NEVER answer a knowledge question with "I don't have that information" without searching the vault first
- After searching, answer directly from the retrieved document content and cite the source title

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

  // Cap model tier — non-agency plans can't use the strong model
  const effectiveModel = !planCtx.limits.ai_command_bar_strong_model && selected.tier === "strong"
    ? GROQ_MODEL_STD
    : selected.model

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    ...cappedHistory,
    { role: "user", content: message },
  ]

  const groq = getGroqClient()

  console.log(`[CMD] model=${effectiveModel} tier=${selected.tier} plan=${planCtx.plan} history=${cappedHistory.length}`)

  // ── Everything from here runs INSIDE the stream ──────────────────────────
  const enc = new TextEncoder()

  const readable = new ReadableStream({
    async start(ctrl) {
      const enqueue = (payload: Record<string, any>) => {
        try {
          ctrl.enqueue(enc.encode(sseChunk(payload)))
        } catch {
          // controller may be closed if client disconnected
        }
      }

      const actionEvents: Array<Record<string, any>> = []
        const createActionsExecuted = new Set<string>()
        let lastActionMessage = ""
        // Shared across all steps — deduplicates repeated read tool calls with identical args
        const toolMemo = createToolMemoizer()

        try {
          // ── Agentic loop (max 4 steps) ───────────────────────────────────
          for (let step = 0; step < 4; step++) {

          // ── Non-streaming call to get tool decisions ───────────────────
          let response: any
          try {
            response = await groqCall(groq, effectiveModel, {
              messages,
              tools: planFilteredTools as any,
              tool_choice: "auto",
              max_tokens: 1024,
              temperature: 0.2,
            })
          } catch (apiErr: any) {
            const msg = apiErr?.message || ""
            if (apiErr?.status === 400 && msg.includes("tool_use_failed")) {
              console.warn(`[CMD] step=${step} schema error — retrying no-tools`)
              response = await groqCall(groq, effectiveModel, { messages, max_tokens: 800, temperature: 0 })
            } else {
              throw apiErr
            }
          }

          const choice = response.choices[0]
          const toolCalls = choice?.message?.tool_calls

          // ── No tool calls → stream final text answer word-by-word ──────
          if (!toolCalls || toolCalls.length === 0) {
            console.log(`[CMD] step=${step} → streaming text response`)

            // Flush any action events first
            for (const ev of actionEvents) {
              enqueue({ type: "action_executed", ...ev })
            }

console.log(`[CMD] step=${step} → final text stream`)
          for await (const delta of streamFinalText(groq, effectiveModel, messages, { max_tokens: 1024, temperature: 0.2 })) {
            enqueue({ type: "delta", content: delta })
          }

            enqueue({ type: "done" })
            ctrl.close()
            return
          }

          // ── Has tool calls ─────────────────────────────────────────────
          console.log(`[CMD] step=${step} tools=${toolCalls.map((tc: any) => tc.function.name).join(",")}`)

          const hasRead   = toolCalls.some((tc: any) => READ_TOOL_NAMES.has(tc.function.name))
          const hasAction = toolCalls.some((tc: any) => !READ_TOOL_NAMES.has(tc.function.name))
          const isMixed   = hasRead && hasAction

          const readCalls   = toolCalls.filter((tc: any) =>  READ_TOOL_NAMES.has(tc.function.name))
          const actionCalls = toolCalls.filter((tc: any) => !READ_TOOL_NAMES.has(tc.function.name))

          const toolResults: Array<{ tool_call_id: string; role: "tool"; content: string }> = []

          // ── READ tools in parallel, with per-tool status events ────────
          if (readCalls.length > 0) {
            // Fire status events for every read tool immediately
            for (const tc of readCalls) {
              const label = READ_TOOL_LABELS[tc.function.name] ?? "Reading data…"
              enqueue({
                type: "tool_started",
                tool: tc.function.name,
                actionType: "read",
                label,
              })
            }

            const startTime = Date.now()

            const readPromises = readCalls.map(async (tc: any) => {
              const toolName = tc.function.name
              let toolArgs: Record<string, any> = {}
              try { toolArgs = JSON.parse(tc.function.arguments) } catch {}
              toolArgs = repairArgs(toolName, toolArgs)

              const key = memoKey(toolName, toolArgs)
              const result = await toolMemo.getOrExecute(key, () =>
                executeReadTool(toolName as ReadToolName, toolArgs, founder_id)
              )

              if (result.teamData)    actionContext.team     = result.teamData
              if (result.projectData) actionContext.projects = result.projectData

              // Signal this specific tool is done
              enqueue({ type: "tool_done", tool: toolName, actionType: "read" })

              return {
                tool_call_id: tc.id,
                role: "tool" as const,
                content: result.content,
              }
            })

            const readResults = await Promise.all(readPromises)
            toolResults.push(...readResults)

            console.log(`[CMD] Read tools done in ${Date.now() - startTime}ms`)
          }

          // ── ACTION tools sequentially, with per-tool status events ─────
          for (const tc of actionCalls) {
            const toolName = tc.function.name
            let toolArgs: Record<string, any> = {}
            try { toolArgs = JSON.parse(tc.function.arguments) } catch {}
            toolArgs = repairArgs(toolName, toolArgs)

            if (isMixed) {
              // Defer — read tools need to run first
              console.log(`[CMD] deferred ${toolName} (mixed batch)`)
              toolResults.push({
                tool_call_id: tc.id,
                role: "tool",
                content: JSON.stringify({
                  success: false,
                  message: `Deferred: call ${toolName} again after read results.`,
                }),
              })
              continue
            }

            // Guard against duplicate create calls
            if (
              (toolName === "create_task" || toolName === "create_project") &&
              createActionsExecuted.has(toolName)
            ) {
              console.log(`[CMD] BLOCKED duplicate ${toolName}`)
              toolResults.push({
                tool_call_id: tc.id,
                role: "tool",
                content: JSON.stringify({
                  success: false,
                  message: `${toolName} already executed this request.`,
                }),
              })
              continue
            }
            if (toolName === "create_task" || toolName === "create_project") {
              createActionsExecuted.add(toolName)
            }

            // Fire status event before executing
            const actionLabel = ACTION_TOOL_LABELS[toolName] ?? "Executing…"
            enqueue({
              type: "tool_started",
              tool: toolName,
              actionType: "action",
              label: actionLabel,
            })

            const result: ActionResult = await executeAction(
              toolName as AIToolName,
              toolArgs,
              actionContext
            )

            // Signal action done
            enqueue({ type: "tool_done", tool: toolName, actionType: "action" })

            if (result.message) lastActionMessage = result.message
            toolResults.push({
              tool_call_id: tc.id,
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

              // Bust caches + learn from actions
              if (toolName === "create_task" || toolName === "update_task") {
                await bust(CK.miniContext(founder_id), CK.teamWorkload(founder_id))
                if (toolName === "create_task") {
                  await learnFromAction(founder_id, "task_created", result.data || {})
                }
              }
              if (toolName === "create_project" || toolName === "update_project") {
                await bust(CK.miniContext(founder_id), CK.projects(founder_id))
              }
            }
          }

          messages.push(choice.message)
          messages.push(...toolResults)

          // If we executed a non-mixed action, stream back the result immediately
          if (actionEvents.length > 0 && !isMixed) {
            for (const ev of actionEvents) {
              enqueue({ type: "action_executed", ...ev })
            }

            // Stream the confirmation sentence
            for await (const delta of streamFinalText(groq, effectiveModel, messages, { max_tokens: 256, temperature: 0.2 })) {
              enqueue({ type: "delta", content: delta })
            }

            enqueue({ type: "done" })
            ctrl.close()
            return
          }
        }

        // ── Max steps exhausted — stream whatever we have ────────────────
        console.log(`[CMD] max steps reached, streaming final`)
        for (const ev of actionEvents) {
          enqueue({ type: "action_executed", ...ev })
        }

        console.log(`[CMD] max steps exhausted → final stream`)
        for await (const delta of streamFinalText(groq, effectiveModel, messages, { max_tokens: 1024, temperature: 0.5 })) {
          enqueue({ type: "delta", content: delta })
        }

        enqueue({ type: "done" })
        ctrl.close()

      } catch (err) {
        console.error("[CMD] stream error:", err)
        enqueue({
          type: "error",
          message: "I hit a temporary issue. Please retry.",
        })
        ctrl.close()
      }
    },
  })

  return new Response(readable, { headers: SSE_HEADERS })
}