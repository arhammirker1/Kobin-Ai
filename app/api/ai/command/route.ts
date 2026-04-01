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
import { NextResponse } from "next/server"

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
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { message, history = [] } = await request.json()
    if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 })

    // Resolve founder
    let founder_id = user.id
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("user_type").eq("id", user.id).single()

    if (profile?.user_type === "team_member") {
      const { data: tm } = await supabaseAdmin
        .from("team_members").select("founder_id")
        .eq("user_id", user.id).eq("is_active", true).single()
      if (tm?.founder_id) founder_id = tm.founder_id
    }

    // Build mini context (Redis-cached 45s)
    const miniContext = await buildMiniContext(founder_id)

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

## STRICT RULES — NEVER VIOLATE

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

    const groq = getGroqClient()
    const actionEvents: Array<Record<string, any>> = []
    const createActionsExecuted = new Set<string>()
    let lastActionMessage = ""

    console.log(`[CMD] model=${selected.model} tier=${selected.tier} history=${cappedHistory.length}`)

    // ── Agentic loop (max 4 steps) ────────────────────────────────────────
    for (let step = 0; step < 4; step++) {

      let response: any
      try {
        response = await groqCall(groq, selected.model, {
          messages,
          tools: ALL_TOOLS as any,
          tool_choice: "auto",
          max_tokens: 1024,
          temperature: 0.2,
        })
      } catch (apiErr: any) {
        // Schema validation error from Groq — retry without tools
        const msg = apiErr?.message || ""
        if (apiErr?.status === 400 && msg.includes("tool_use_failed")) {
          console.warn(`[CMD] step=${step} schema error — retrying no-tools`)
          response = await groqCall(groq, selected.model, { messages, max_tokens: 800, temperature: 0 })
        } else {
          throw apiErr
        }
      }

      const choice = response.choices[0]
      const toolCalls = choice?.message?.tool_calls

      // No tool calls → text response
      if (!toolCalls || toolCalls.length === 0) {
        const content = choice?.message?.content || ""
        console.log(`[CMD] step=${step} text response`)

        return makeStream(async (ctrl) => {
          const enc = new TextEncoder()
          // Flush any action events first
          for (const ev of actionEvents) {
            ctrl.enqueue(enc.encode(sseChunk({ type: "action_executed", ...ev })))
          }
          if (content) {
            ctrl.enqueue(enc.encode(sseChunk({ type: "delta", content })))
          }
          ctrl.enqueue(enc.encode(sseChunk({ type: "done" })))
          ctrl.close()
        })
      }

      // Has tool calls — execute them
      console.log(`[CMD] step=${step} tools=${toolCalls.map((tc: any) => tc.function.name).join(",")}`)

      // Detect mixed read+action batch — defer action tools
      const hasRead   = toolCalls.some((tc: any) => READ_TOOL_NAMES.has(tc.function.name))
      const hasAction = toolCalls.some((tc: any) => !READ_TOOL_NAMES.has(tc.function.name))
      const isMixed   = hasRead && hasAction

      const toolResults: Array<{ tool_call_id: string; role: "tool"; content: string }> = []

      for (const tc of toolCalls) {
        const toolName = tc.function.name
        let toolArgs: Record<string, any> = {}
        try { toolArgs = JSON.parse(tc.function.arguments) } catch {}
        toolArgs = repairArgs(toolName, toolArgs)

        if (READ_TOOL_NAMES.has(toolName)) {
          // Read tool
          const result = await executeReadTool(toolName as ReadToolName, toolArgs, founder_id)
          if (result.teamData)    actionContext.team     = result.teamData
          if (result.projectData) actionContext.projects = result.projectData
          toolResults.push({ tool_call_id: tc.id, role: "tool", content: result.content })

        } else if (isMixed) {
          // Defer action tools when mixed with read tools
          console.log(`[CMD] deferred ${toolName} (mixed batch)`)
          toolResults.push({
            tool_call_id: tc.id, role: "tool",
            content: JSON.stringify({ success: false, message: `Deferred: call ${toolName} again after read results.` }),
          })

        } else {
          // Action tool
          if ((toolName === "create_task" || toolName === "create_project") && createActionsExecuted.has(toolName)) {
            console.log(`[CMD] BLOCKED duplicate ${toolName}`)
            toolResults.push({
              tool_call_id: tc.id, role: "tool",
              content: JSON.stringify({ success: false, message: `${toolName} already executed this request.` }),
            })
            continue
          }
          if (toolName === "create_task" || toolName === "create_project") {
            createActionsExecuted.add(toolName)
          }

          const result: ActionResult = await executeAction(toolName as AIToolName, toolArgs, actionContext)
          if (result.message) lastActionMessage = result.message
          toolResults.push({ tool_call_id: tc.id, role: "tool", content: JSON.stringify(result) })

          if (result.success) {
            actionEvents.push({
              tool: toolName,
              ...result.data,
              needs_confirmation: result.needs_confirmation,
              confirmation_action: result.confirmation_action,
            })

            // Bust relevant caches after mutations
            if (toolName === "create_task" || toolName === "update_task") {
              await bust(CK.miniContext(founder_id), CK.teamWorkload(founder_id))
            }
            if (toolName === "create_project" || toolName === "update_project") {
              await bust(CK.miniContext(founder_id), CK.projects(founder_id))
            }
          }
        }
      }

      messages.push(choice.message)
      messages.push(...toolResults)

      // If we executed an action successfully, stream the result immediately
      if (actionEvents.length > 0 && !isMixed) {
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
    console.log(`[CMD] max steps reached, streaming final`)
    return makeStream(async (ctrl) => {
      const enc = new TextEncoder()
      for (const ev of actionEvents) {
        ctrl.enqueue(enc.encode(sseChunk({ type: "action_executed", ...ev })))
      }
      const stream = await groqCall(groq, selected.model, { messages, stream: true, max_tokens: 1024, temperature: 0.5 })
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || ""
        if (delta) ctrl.enqueue(enc.encode(sseChunk({ type: "delta", content: delta })))
      }
      ctrl.enqueue(enc.encode(sseChunk({ type: "done" })))
      ctrl.close()
    })

  } catch (err) {
    console.error("[CMD] error:", err)
    return NextResponse.json({
      error: "AI command failed",
      user_message: "I hit a temporary issue. Please retry.",
    }, { status: 500 })
  }
}