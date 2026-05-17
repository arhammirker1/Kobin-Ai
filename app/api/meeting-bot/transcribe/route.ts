/**
 * POST /api/meeting-bot/transcribe
 * 
 * Proxies audio to Groq Whisper API for transcription.
 * Keeps the API key server-side — the Electron renderer sends audio here
 * instead of directly to Groq.
 * 
 * Accepts: multipart/form-data with `file` (audio blob)
 * Returns: { text: string }
 */

import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as Blob | null
    const model = (formData.get("model") as string) || "whisper-large-v3-turbo"
    const language = (formData.get("language") as string) || "en"

    if (!file) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 })
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 })
    }

    // Forward to Groq Whisper API
    const groqFormData = new FormData()
    groqFormData.append("file", file, "audio.webm")
    groqFormData.append("model", model)
    groqFormData.append("language", language)
    groqFormData.append("response_format", "json")

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: groqFormData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[transcribe] Groq Whisper error:", response.status, errorText)
      return NextResponse.json(
        { error: "Transcription failed", details: errorText },
        { status: response.status }
      )
    }

    const result = await response.json()

    return NextResponse.json({
      text: result.text || "",
    })
  } catch (error: any) {
    console.error("[transcribe] Error:", error)
    return NextResponse.json(
      { error: "Transcription failed", details: error.message },
      { status: 500 }
    )
  }
}
