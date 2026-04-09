import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGroqClient, GROQ_MODEL_STD } from "@/lib/ai/groq"
import { refreshGoogleToken } from "@/lib/google/token"
import { NextResponse } from "next/server"

function decodeBase64Url(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
  } catch { return "" }
}

function extractBody(payload: any): string {
  if (!payload) return ""
  if (payload.body?.data) return decodeBase64Url(payload.body.data)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data)
      if (part.mimeType === "text/html" && part.body?.data)
        return decodeBase64Url(part.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    }
  }
  return ""
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { thread_id, relationship_id, tone = "professional" } = await request.json()
    if (!thread_id) return NextResponse.json({ error: "thread_id required" }, { status: 400 })

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("full_name").eq("id", user.id).single()

    let relContext = ""
    if (relationship_id) {
      const { data: rel } = await supabaseAdmin
        .from("relationships")
        .select("full_name, company, role, pipeline_stage, pipeline_notes, deal_value")
        .eq("id", relationship_id).single()

      if (rel) {
        relContext = `Contact: ${rel.full_name}${rel.company ? ` at ${rel.company}` : ""}${rel.role ? `, ${rel.role}` : ""}
Pipeline stage: ${rel.pipeline_stage.replace(/_/g, " ")}${rel.pipeline_notes ? `\nNotes: ${rel.pipeline_notes}` : ""}${rel.deal_value ? `\nDeal: $${rel.deal_value.toLocaleString()}` : ""}`
      }
    }

    const { data: integration } = await supabaseAdmin
      .from("google_integrations").select("*").eq("user_id", user.id).eq("is_connected", true).single()

    if (!integration) return NextResponse.json({ error: "Gmail not connected" }, { status: 400 })

    const accessToken = await refreshGoogleToken(integration)
    const tRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread_id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!tRes.ok) return NextResponse.json({ error: "Thread not found" }, { status: 404 })

    const tData = await tRes.json()
    const messages = tData.messages || []
    const lastMsg = messages[messages.length - 1]
    const getH = (n: string) => lastMsg?.payload?.headers?.find((h: any) => h.name === n)?.value || ""
    const fromHeader = getH("From")
    const emailMatch = fromHeader.match(/<(.+?)>/)
    const senderEmail = emailMatch ? emailMatch[1] : fromHeader
    const subject = messages[0]?.payload?.headers?.find((h: any) => h.name === "Subject")?.value || ""

    const recentContent = messages.slice(-4).map((msg: any) => {
      const from = msg.payload?.headers?.find((h: any) => h.name === "From")?.value || ""
      return `From: ${from}\n${extractBody(msg.payload).slice(0, 500)}`
    }).join("\n\n---\n\n")

    const groq = getGroqClient()
    const resp = await groq.chat.completions.create({
      model: GROQ_MODEL_STD,
      max_tokens: 400,
      temperature: 0.7,
      messages: [{
        role: "system",
        content: `You are drafting a ${tone} email reply for ${profile?.full_name || "the founder"}.
${relContext ? `\nCRM context:\n${relContext}` : ""}

Rules:
- Start directly with the greeting (e.g. "Hi Sarah,")
- Be concise: 3–5 sentences max
- Be specific and responsive to what was asked
- End with one clear next step or CTA
- Do NOT include [Your name], signatures, or placeholders`
      }, {
        role: "user",
        content: `Draft a reply to this email thread:\n\nSubject: ${subject}\n\n${recentContent}`,
      }]
    })

    return NextResponse.json({
      draft: resp.choices[0]?.message?.content || "",
      to: senderEmail,
      subject,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}