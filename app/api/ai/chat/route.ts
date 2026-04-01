import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGroqClient, GROQ_MODEL_STD, GROQ_MODEL } from "@/lib/ai/groq"
import { buildMiniContext } from "@/lib/ai/mini-context"
import { READ_TOOLS, executeReadTool } from "@/lib/ai/mcp-read-tools"
import type { ReadToolName } from "@/lib/ai/mcp-read-tools"
import { selectModelForRequest } from "@/lib/ai/model-router"
import { NextResponse } from "next/server"
import { aiLogger, generateRequestId, AIPerformanceTracker } from "@/lib/ai/performance-logger"
import { setRequestId } from "@/lib/redis"

// ── Token estimation ────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function isModelDecommissionedError(err: any): boolean {
  const msg = err?.message || err?.error?.message || ""
  return String(msg).toLowerCase().includes("decommissioned")
}

async function createCompletionWithModelFallback(
  groq: any,
  primaryModel: string,
  payload: Record<string, any>,
  tracker: AIPerformanceTracker
) {
  try {
    const start = performance.now()
    const result = await groq.chat.completions.create({
      ...payload,
      model: primaryModel,
    })
    const duration = performance.now() - start
    
    // Estimate tokens
    const inputTokens = estimateTokens(JSON.stringify(payload.messages))
    const outputTokens = estimateTokens(result.choices[0]?.message?.content || "")
    tracker.logLLMCall(primaryModel, inputTokens, outputTokens, duration)
    
    return result
  } catch (err: any) {
    if (!isModelDecommissionedError(err)) throw err
    const fallbackModel = GROQ_MODEL_STD
    if (fallbackModel === primaryModel) throw err
    console.warn(`[AI-CHAT] Model ${primaryModel} is decommissioned. Falling back to ${fallbackModel}.`)
    return await groq.chat.completions.create({
      ...payload,
      model: fallbackModel,
    })
  }
}

// ── Request-level tool memoization ─────────────────────────────────────────────

type ChatToolMemoKey = string
type ChatToolMemoValue = string

function chatMemoKey(toolName: string, args: Record<string, any>): ChatToolMemoKey {
  return `${toolName}:${JSON.stringify(args)}`
}

function createChatToolMemoizer(tracker: AIPerformanceTracker) {
  const memo = new Map<ChatToolMemoKey, Promise<ChatToolMemoValue>>()

  return {
    async getOrExecute(
      key: ChatToolMemoKey,
      executor: () => Promise<string>
    ): Promise<string> {
      if (memo.has(key)) {
        console.log(`[CHAT] 💾 MEMO HIT: ${key}`)
        return memo.get(key)!
      }
      console.log(`[CHAT] 💾 MEMO MISS: ${key}`)
      const promise = executor()
      memo.set(key, promise)
      return promise
    },
    clear() {
      memo.clear()
    }
  }
}

export async function POST(request: Request) {
  // Generate request ID and initialize performance tracker
  const requestId = generateRequestId()
  const tracker = new AIPerformanceTracker(requestId)
  setRequestId(requestId)

  const overallStart = performance.now()
  tracker.mark("Request received")

  console.log("")
  console.log("═══════════════════════════════════════════════════════════════")
  console.log(`[${requestId}] 💬 AI CHAT START`)
  console.log("═══════════════════════════════════════════════════════════════")

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      tracker.logError("Auth", "Unauthorized")
      tracker.printSummary()
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { message, room_id, project_id } = await request.json()
    if (!message?.trim()) {
      tracker.logError("Validation", "Empty message")
      tracker.printSummary()
      return NextResponse.json({ error: "Message required" }, { status: 400 })
    }

    console.log(`[${requestId}] 👤 User: ${user.id}`)
    console.log(`[${requestId}] 💬 Message: "${message.slice(0, 100)}${message.length > 100 ? "..." : ""}"`)
    if (room_id) console.log(`[${requestId}] 📍 Room: ${room_id}`)

    // Resolve founder_id
    let founder_id = user.id
    const profileStart = performance.now()
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
    tracker.mark("Auth & profile resolution", { userType: profile?.user_type, founderId: founder_id })

    // Build mini context
    const miniContextStart = performance.now()
    const miniContext = await buildMiniContext(founder_id)
    const miniContextTime = performance.now() - miniContextStart
    console.log(`[${requestId}] 🗄️ MiniContext built (${miniContextTime.toFixed(0)}ms)`)

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
- Be conversational but precise.
- Reference data naturally — don't dump raw tool results
- If asked about tasks, projects, or CRM — use the appropriate read tool first
- Today's date is in the context above.

## Output Rules
- Do not expose internal chain-of-thought.
- Do not expose raw tool names in user-facing responses.
- Do not fabricate data. If missing, say so and ask one clear follow-up question.
- Respond like a polished executive assistant.`

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ]
    const selectedModel = selectModelForRequest({
      intent: "chat",
      message,
      historyCount: 1,
    })
    // chat defaults to STD tier for tool-calling quality
    if (selectedModel.tier === "fast") selectedModel.model = GROQ_MODEL_STD

    const groq = getGroqClient()
    const toolsCalled: string[] = []

    const systemTokens = estimateTokens(systemPrompt)
    const toolSchemaTokens = estimateTokens(JSON.stringify(READ_TOOLS))

    console.log("")
    console.log(`[${requestId}] 📤 === LLM INPUT ===`)
    console.log(`[${requestId}] 🤖 Model: ${selectedModel.model} (${selectedModel.tier} tier)`)
    console.log(`[${requestId}] 📊 System: ~${systemTokens} tokens | Tools schema: ~${toolSchemaTokens} tokens`)

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

    // ── Multi-step tool loop (max 3 iterations) ──────────────────────────
    for (let step = 0; step < 3; step++) {
      const inputTokens = estimateTokens(JSON.stringify(messages))
      tracker.mark(`Step ${step + 1} started`, { inputTokens })

      console.log("")
      console.log(`[${requestId}] ═══ STEP ${step + 1} ═══`)
      console.log(`[${requestId}] 📥 Input: ~${inputTokens} tokens`)

      let response: any
      try {
        tracker.logLLMInput(messages, READ_TOOLS as any[])
        
        response = await createCompletionWithModelFallback(groq, selectedModel.model || GROQ_MODEL, {
          messages,
          tools: READ_TOOLS as any,
          tool_choice: "auto",
          max_tokens: 1024,
          temperature: 0.7,
        }, tracker)
      } catch (apiError: any) {
        // Groq returns 400 when model outputs malformed tool args (e.g. string for boolean)
        const errorMessage = apiError?.message || apiError?.error?.message || ""
        if (apiError?.status === 400 && errorMessage.includes("tool_use_failed")) {
          console.warn(`[${requestId}] ⚠️ LLM schema error — retrying without tools`)
          response = await createCompletionWithModelFallback(groq, selectedModel.model || GROQ_MODEL, {
            messages,
            max_tokens: 1024,
            temperature: 0.7,
          }, tracker)
        } else {
          tracker.logError(`LLM call step ${step}`, apiError)
          tracker.printSummary()
          throw apiError
        }
      }

      const choice = response.choices[0]
      const toolCalls = choice?.message?.tool_calls

      if (!toolCalls || toolCalls.length === 0) {
        // No tools — stream final response
        const content = choice?.message?.content || ""
        console.log(`[${requestId}] 💭 No tools → text response (${content.length} chars)`)
        console.log(`[${requestId}] 📊 Tools used: ${toolsCalled.length > 0 ? toolsCalled.join(", ") : "none"}`)

        if (step > 0) {
          // Already have tool context — use the generated response
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
                console.log(`[${requestId}] 📤 Streaming response: "${content.slice(0, 100)}..."`)
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
          tracker.mark("Response streamed", { contentLength: content.length })
          tracker.printSummary()
          return new Response(readable, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
          })
        }

        // First step, no tools — stream directly
        const directStream = await groq.chat.completions.create({
          messages,
          stream: true,
          max_tokens: 1024,
          temperature: 0.7,
        })

        const encoder = new TextEncoder()
        let fullContent = ""
        const streamStart = performance.now()
        let chunkCount = 0
        
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
                  chunkCount++
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
        
        console.log(`[${requestId}] 📡 Stream completed: ${chunkCount} chunks`)
        tracker.mark("Direct stream", { chunks: chunkCount, contentLength: fullContent.length })
        tracker.printSummary()
        
        return new Response(readable, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
        })
      }

      // Execute read tools
      console.log(`[${requestId}] 🔧 Tools called: ${toolCalls.map((tc: any) => tc.function.name).join(", ")}`)

      // Initialize memoizer for this step
      const chatMemo = createChatToolMemoizer(tracker)
      const toolResults: Array<{ tool_call_id: string; role: "tool"; content: string }> = []

      // Execute ALL read tools in PARALLEL
      const toolExecStart = performance.now()
      console.log(`[${requestId}] ⚡ Executing ${toolCalls.length} read tool(s) in PARALLEL`)

      const readPromises = toolCalls.map(async (toolCall: any) => {
        const toolName = toolCall.function.name as ReadToolName
        toolsCalled.push(toolName)

        let toolArgs: Record<string, any> = {}
        try {
          toolArgs = JSON.parse(toolCall.function.arguments)
        } catch {
          toolArgs = {}
        }

        const key = chatMemoKey(toolName, toolArgs)
        console.log(`[${requestId}] 🔧 → ${toolName}(${JSON.stringify(toolArgs).slice(0, 50)}...)`)

        const execStart = performance.now()
        const content = await chatMemo.getOrExecute(key, async () => {
          const result = await executeReadTool(toolName, toolArgs, founder_id)
          const tokens = estimateTokens(result.content)
          console.log(`[${requestId}] ✅ ← ${toolName} → ${tokens} tokens`)
          return result.content
        })
        const execTime = performance.now() - execStart
        
        tracker.logToolCall(toolName, execTime, false)

        return {
          tool_call_id: toolCall.id,
          role: "tool" as const,
          content,
        }
      })

      const readResults = await Promise.all(readPromises)
      toolResults.push(...readResults)

      const elapsed = performance.now() - toolExecStart
      console.log(`[${requestId}] ⚡ Read tools completed in ${elapsed.toFixed(0)}ms (parallel)`)
      tracker.mark("Read tools execution", { count: toolCalls.length, time: elapsed })

      messages.push(choice.message)
      messages.push(...toolResults)
    }

    // Exhausted loop — final streaming response
    console.log(`[${requestId}] ⚠️ Max steps reached, streaming final`)
    console.log(`[${requestId}] 📊 Tools used: ${toolsCalled.join(", ")}`)

    const finalStream = await groq.chat.completions.create({
      messages,
      stream: true,
      max_tokens: 1024,
      temperature: 0.7,
    })

    const encoder = new TextEncoder()
    let fullContent = ""
    const streamStart = performance.now()
    let chunkCount = 0
    
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
              chunkCount++
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
    
    const streamTime = performance.now() - streamStart
    console.log(`[${requestId}] 📡 Stream completed: ${chunkCount} chunks in ${streamTime.toFixed(0)}ms`)
    tracker.mark("Final stream", { chunks: chunkCount, contentLength: fullContent.length })
    tracker.printSummary()
    
    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    tracker.logError("Request failed", err)
    console.error(`[${requestId}] ❌ ERROR: ${message}`)
    tracker.printSummary()
    return NextResponse.json(
      {
        error: "AI chat execution failed",
        detail: message,
        degraded_mode: true,
        user_message: "I hit a temporary issue accessing tools. Please retry in a moment.",
      },
      { status: 500 }
    )
  }
}
