export const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

// Groq client is instantiated lazily server-side only
// Never import this function in client components
export function getGroqClient() {
  const Groq = require("groq-sdk").default
  return new Groq({ apiKey: process.env.GROQ_API_KEY! })
}