import { GROQ_MODEL_FAST, GROQ_MODEL_STD, GROQ_MODEL_STRONG } from "./groq"

interface ModelRoutingInput {
  intent: "chat" | "command"
  message: string
  historyCount: number
}

interface ModelRoutingResult {
  model: string
  tier: "fast" | "std" | "strong"
  reason: string
}

function isComplexRequest(message: string): boolean {
  const lower = message.toLowerCase()
  return [
    "plan", "roadmap", "analyze", "compare", "tradeoff",
    "step by step", "create", "update", "delete", "assign",
    "multi", "several", "all", "every",
  ].some((s) => lower.includes(s))
}

function isSimpleRequest(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    message.length < 60 &&
    !isComplexRequest(message) &&
    ["what", "who", "when", "how many", "show", "list", "status"].some(
      (s) => lower.startsWith(s)
    )
  )
}

export function selectModelForRequest(input: ModelRoutingInput): ModelRoutingResult {
  const { intent, message, historyCount } = input

  // Fast: simple read-only chat questions
  if (intent === "chat" && isSimpleRequest(message) && historyCount < 5) {
    return { model: GROQ_MODEL_FAST, tier: "fast", reason: "simple-chat" }
  }

  // Strong: complex multi-step planning or long conversations
  if (
    intent === "command" &&
    (historyCount >= 12 || message.length > 300 || /plan|roadmap|analyze|compare/i.test(message))
  ) {
    return { model: GROQ_MODEL_STRONG, tier: "strong", reason: "complex-command" }
  }

  // Std (default): tool calling, commands, standard chat
  return { model: GROQ_MODEL_STD, tier: "std", reason: "default-std" }
}