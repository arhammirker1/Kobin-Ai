// Three-tier model strategy:
//   FAST   → llama-3.1-8b-instant        560 t/s  — simple chat, summaries
//   STD    → openai/gpt-oss-20b          1000 t/s — tool calling, commands
//   STRONG → llama-3.3-70b-versatile      280 t/s  — complex reasoning, planning

export const GROQ_MODEL_FAST   = process.env.GROQ_MODEL_FAST   || "llama-3.1-8b-instant"
export const GROQ_MODEL_STD    = process.env.GROQ_MODEL_STD    || "openai/gpt-oss-20b"
export const GROQ_MODEL_STRONG = process.env.GROQ_MODEL_STRONG || "llama-3.3-70b-versatile"

/** Legacy export — used as fallback default */
export const GROQ_MODEL = GROQ_MODEL_STD

export function getGroqClient() {
  const Groq = require("groq-sdk").default
  return new Groq({ apiKey: process.env.GROQ_API_KEY! })
}