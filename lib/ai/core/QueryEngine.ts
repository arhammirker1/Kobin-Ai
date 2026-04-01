import { Redis } from "@upstash/redis"
import { getGroqClient } from "../groq"
import { PermissionBroker } from "./PermissionBroker"
import type { BaseTool } from "./BaseTool"
import type { ActionContext } from "../action-executor"

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
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

  constructor(options: QueryEngineOptions) {
    this.conversationId = options.conversationId
    this.model = options.model
    this.tools = new Map(options.tools.map((t) => [t.name, t]))
    this.permissionBroker = new PermissionBroker()
  }

  /**
   * Run the query loop for a user message.
   */
  public async *query(userMessage: string, context: ActionContext) {
    // 1. Fetch transcript from Redis
    const transcriptKey = `transcript:${this.conversationId}`
    const existingTranscript = (await redis.get<any[]>(transcriptKey)) || []
    
    // 2. Add user message
    const messages = [
      ...existingTranscript,
      { role: "user", content: userMessage }
    ]

    const groq = getGroqClient()
    const toolsJson = Array.from(this.tools.values()).map((t) => t.toJSON())

    // ── Turn Loop ──────────────────────────────────────────────────────────
    for (let turn = 0; turn < 10; turn++) {
      const response = await groq.chat.completions.create({
        model: this.model,
        messages,
        tools: toolsJson as any,
        tool_choice: "auto",
      })

      const choice = response.choices[0]
      const message = choice.message
      messages.push(message)

      if (!message.tool_calls || message.tool_calls.length === 0) {
        // No more tool calls, yield the final text response
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

        // 1. Check Permissions
        const decision = await this.permissionBroker.decide(tool, args, context)
        if (!decision.allowed) {
          yield {
            type: "action_needed",
            tool: tool.name,
            args,
            level: decision.level,
            reason: decision.reason
          }
          // We pause and save state here in a real scenario, but for now we'll yield
          return
        }

        // 2. Execute tool
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

    // 3. Save transcript back to Redis
    await redis.set(transcriptKey, messages, { ex: 3600 * 24 }) // Expire after 24h
  }
}
