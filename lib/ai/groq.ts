// Default fallback model. Real requests should use selectModelForRequest()
// from model-router to dynamically choose a stronger model when needed.
export const GROQ_MODEL = process.env.GROQ_MODEL_FAST || "llama-3.1-8b-instant"

// Groq client is instantiated lazily server-side only.
// Never import this function in client components.
export function getGroqClient() {
  const Groq = require("groq-sdk").default
  return new Groq({ apiKey: process.env.GROQ_API_KEY! })
}
