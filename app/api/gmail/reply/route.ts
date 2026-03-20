import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshGoogleToken } from "@/lib/google/token"
import { NextResponse } from "next/server"

function encodeBase64Url(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { threadId, to, subject, body, messageId } = await request.json()

    const { data: integration } = await supabaseAdmin
      .from("google_integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_connected", true)
      .single()

    if (!integration) return NextResponse.json({ error: "Gmail not connected" }, { status: 400 })

    const accessToken = await refreshGoogleToken(integration)
    const from = integration.google_email
    const reSubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`

    const emailContent = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${reSubject}`,
      ...(messageId ? [`In-Reply-To: ${messageId}`, `References: ${messageId}`] : []),
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body,
    ].join("\r\n")

    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: encodeBase64Url(emailContent), threadId }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: `Gmail send failed: ${err}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}