interface ModelRoutingInput {
  intent: "chat" | "command"
  message: string
  historyCount: number
}

interface ModelRoutingResult {
  model: string
  tier: "fast" | "strong"
  reason: string
}

function estimateTokens(text: string): number {
  return Math.ceil((text || "").length / 4)
}

function isComplexRequest(message: string): boolean {
  const lower = message.toLowerCase()
  const complexSignals = [
    "plan",
    "roadmap",
    "analyze",
    "compare",
    "tradeoff",
    "step by step",
    "multi",
    "several",
    "and then",
    "assign",
    "project",
    "task",
    "crm",
    "calendar",
    "vault",
  ]
  return complexSignals.some((s) => lower.includes(s))
}

export function selectModelForRequest(input: ModelRoutingInput): ModelRoutingResult {
  const fastModel = process.env.GROQ_MODEL_FAST || "meta-llama/llama-4-scout-17b-16e-instruct"
  const strongModel = process.env.GROQ_MODEL_STRONG || "llama-3.1-70b-versatile"

  const messageTokens = estimateTokens(input.message)
  const heavyConversation = input.historyCount >= 10
  const complex = isComplexRequest(input.message)

  // Command mode gets stronger default behavior for tool orchestration.
  if (input.intent === "command" && (complex || heavyConversation || messageTokens > 180)) {
    return {
      model: strongModel,
      tier: "strong",
      reason: "complex-command",
    }
  }

  // Chat mode escalates on complexity/long prompts.
  if (input.intent === "chat" && (complex || messageTokens > 240)) {
    return {
      model: strongModel,
      tier: "strong",
      reason: "complex-chat",
    }
  }

  return {
    model: fastModel,
    tier: "fast",
    reason: "default-fast",
  }
}

