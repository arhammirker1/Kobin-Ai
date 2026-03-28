export const GROQ_MODEL = "llama-3.3-70b-versatile"

// Groq client is instantiated lazily server-side only
// Never import this function in client components
export function getGroqClient() {
  const Groq = require("groq-sdk").default
  return new Groq({ apiKey: process.env.GROQ_API_KEY! })
}