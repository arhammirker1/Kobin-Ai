import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshGoogleToken } from "@/lib/google/token"
import { NextResponse } from "next/server"

function decodeBase64Url(data: string): string {
  try {
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/")
    return Buffer.from(base64, "base64").toString("utf-8")
  } catch {
    return ""
  }
}

function extractBody(payload: any): string {
  if (!payload) return ""
  if (payload.body?.data) return decodeBase64Url(payload.body.data)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data)
        return decodeBase64Url(part.body.data)
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBase64Url(part.body.data)
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      }
    }
    for (const part of payload.parts) {
      const nested = extractBody(part)
      if (nested) return nested
    }
  }
  return ""
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: integration } = await supabaseAdmin
      .from("google_integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_connected", true)
      .single()

    if (!integration) return NextResponse.json({ error: "Gmail not connected" }, { status: 400 })

    const accessToken = await refreshGoogleToken(integration)

    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!res.ok) return NextResponse.json({ error: "Thread not found" }, { status: 404 })

    const data = await res.json()
    const messages = (data.messages || []).map((msg: any) => {
      const getHeader = (name: string) =>
        msg.payload?.headers?.find((h: any) => h.name === name)?.value || ""
      const fromHeader = getHeader("From")
      const emailMatch = fromHeader.match(/<(.+?)>/)
      const senderEmail = emailMatch ? emailMatch[1] : fromHeader
      const senderName = fromHeader.replace(/<.+?>/, "").trim().replace(/"/g, "") || senderEmail

      return {
        id: msg.id,
        threadId: msg.threadId,
        senderEmail,
        senderName,
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        internalDate: msg.internalDate,
        body: extractBody(msg.payload),
        isUnread: msg.labelIds?.includes("UNREAD") || false,
      }
    })

    // Mark as read (non-fatal)
    fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}/modify`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
      }
    ).catch(() => {})

    return NextResponse.json({ messages, threadId: id, googleEmail: integration.google_email })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}