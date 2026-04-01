import { Redis } from "@upstash/redis"
import { getGroqClient } from "../groq"
import { PermissionBroker } from "./PermissionBroker"
import type { BaseTool } from "./BaseTool"
import type { ActionContext } from "../action-executor"

// ── Redis Setup (with normalization) ────────────────────────────────────────

const redisUrl = (process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/^['"]|['"]$/g, "")
const redisToken = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim().replace(/^['"]|['"]$/g, "")

const redis = new Redis({
  url: redisUrl,
  token: redisToken,
})

export interface QueryEngineOptions {
  conversationId: string
  model: string
  tools: BaseTool[]
  systemPrompt: string
}

export class QueryEngine {
  private readonly conversationId: string
  private readonly model: string
  private readonly tools: Map<string, BaseTool>
  private readonly permissionBroker: PermissionBroker
  private readonly systemPrompt: string

  constructor(options: QueryEngineOptions) {
    this.conversationId = options.conversationId
    this.model = options.model
    this.tools = new Map(options.tools.map((t) => [t.name, t]))
    this.permissionBroker = new PermissionBroker()
    this.systemPrompt = options.systemPrompt
  }

  /**
   * Run the query loop for a user message.
   */
  public async *query(userMessage: string, context: ActionContext) {
    let transcriptKey = `transcript:${this.conversationId}`
    let messages: any[] = []

    // 1. Fetch transcript (Robust)
    try {
      if (redisUrl && redisToken) {
        const existing = await redis.get<any[]>(transcriptKey)
        messages = existing || []
      }
    } catch (err) {
      console.error("[QUERY-ENGINE] Redis read failed:", err)
    }

    // Initialize with system prompt if empty
    if (messages.length === 0) {
      messages.push({ role: "system", content: this.systemPrompt })
    }
    
    // Add user message
    messages.push({ role: "user", content: userMessage })

    const groq = getGroqClient()
    const toolsJson = Array.from(this.tools.values()).map((t) => t.toJSON())

    // ── Protocol Injection ────────────────────────────────────────────────
    // When tools are available, we inject a high-priority instruction to 
    // prevent narration, which triggers Groq's 400 tool_use_failed error.
    const protocolInstruction = toolsJson.length > 0 
      ? "\n\nCRITICAL: If you use a tool, output ONLY the tool call. Do not provide any introductory text, narration, or explanations. Failure to be silent during tool use will cause a system error."
      : ""

    // ── Turn Loop ──────────────────────────────────────────────────────────
    try {
      for (let turn = 0; turn < 10; turn++) {
        // Construct clean message history for Groq
        const requestMessages = messages.map(m => ({
          role: m.role,
          content: m.role === "system" ? m.content + protocolInstruction : (m.content || ""),
          tool_calls: m.tool_calls,
          tool_call_id: m.tool_call_id
        }))

        let response: any
        try {
          response = await groq.chat.completions.create({
            model: this.model,
            messages: requestMessages as any,
            tools: toolsJson as any,
            tool_choice: "auto",
          })
        } catch (modelErr: any) {
          const isNotFound = modelErr?.message?.includes("model") || modelErr?.code === "model_not_found"
          if (isNotFound && this.model !== "llama-3.3-70b-versatile") {
            console.warn(`[QUERY-ENGINE] Model ${this.model} not found. Falling back to Llama 3.3 70B.`)
            response = await groq.chat.completions.create({
              model: "llama-3.3-70b-versatile",
              messages: requestMessages as any,
              tools: toolsJson as any,
              tool_choice: "auto",
            })
          } else {
            throw modelErr
          }
        }

        const choice = response.choices[0]
        const message = choice.message
        
        // Ensure role and content are clean for history
        const messageToPush = { 
          role: "assistant", 
          content: message.content || "",
          tool_calls: message.tool_calls 
        }
        messages.push(messageToPush)

        if (!message.tool_calls || message.tool_calls.length === 0) {
          yield { type: "text", content: message.content || "" }
          break
        }

        // ── Process Tool Calls ────────────────────────────────────────────────
        for (const toolCall of message.tool_calls) {
          const tool = this.tools.get(toolCall.function.name)
          if (!tool) {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `Error: Tool ${toolCall.function.name} not found.`,
            })
            continue
          }

          let args: any = {}
          try {
            args = JSON.parse(toolCall.function.arguments)
          } catch {
            args = {}
          }

          // Permission Check
          const decision = await this.permissionBroker.decide(tool, args, context)
          if (!decision.allowed) {
            yield {
              type: "action_needed",
              tool: tool.name,
              args,
              level: decision.level,
              reason: decision.reason
            }
            // Stop and await external intervention
            return
          }

          // Tool Execution
          try {
            const result = await tool.execute(args, context)
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            })
          } catch (err: any) {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `Error: ${err.message}`,
            })
          }
        }
      }

      // 3. Save transcript (Robust)
      try {
        if (redisUrl && redisToken) {
          await redis.set(transcriptKey, messages, { ex: 3600 * 24 })
        }
      } catch (err) {
        console.error("[QUERY-ENGINE] Redis write failed:", err)
      }
    } catch (err: any) {
      console.error("[QUERY-ENGINE] Reasoning loop failed:", err)
      yield { type: "text", content: `I encountered an error: ${err.message}` }
    }
  }
}
