import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshGoogleToken } from "@/lib/google/token"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: integration } = await supabaseAdmin
      .from("google_integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_connected", true)
      .single()

    if (!integration) return NextResponse.json({ threads: [], connected: false })

    const accessToken = await refreshGoogleToken(integration)

    const { searchParams } = new URL(request.url)
    const fromEmail = searchParams.get("from") || ""
    const emailsParam = searchParams.get("emails") || ""

    let query: string
    if (fromEmail) {
      // Single-email lookup (used by contact threads panel)
      query = `from:${fromEmail}`
    } else if (emailsParam) {
      // CRM contacts filter — build OR query for Gmail
      const emails = emailsParam
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
      if (emails.length === 0) {
        return NextResponse.json({ threads: [], connected: true })
      }
      query = emails.length === 1
        ? `from:${emails[0]}`
        : `from:(${emails.join(" OR ")})`
    } else {
      query = "in:inbox"
    }

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=20&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!listRes.ok) {
  const errText = await listRes.text()
  console.error("[Gmail] threads fetch failed:", listRes.status, errText)
  return NextResponse.json({ threads: [], connected: true })
}

    const listData = await listRes.json()
    const threads = listData.threads || []

    const threadDetails = await Promise.all(
      threads.slice(0, 15).map(async (t: { id: string }) => {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        if (!res.ok) return null
        const data = await res.json()
        const messages = data.messages || []
        if (!messages.length) return null

        const firstMsg = messages[0]
        const lastMsg = messages[messages.length - 1]

        // Find the "other person" in this thread — NOT the current user.
        // This prevents the sender from flipping to the user's own email
        // when they reply, which would break CRM contact matching.
        const userEmail = integration.google_email?.toLowerCase() || ""

        const getHeader = (msg: any, name: string) =>
          msg?.payload?.headers?.find((h: any) => h.name === name)?.value || ""

        // Look through all messages to find the first non-self sender
        let contactEmail = ""
        let contactName = ""
        for (const msg of messages) {
          const from = getHeader(msg, "From")
          const match = from.match(/<(.+?)>/)
          const email = match ? match[1] : from.trim()
          if (email.toLowerCase() !== userEmail) {
            contactEmail = email
            contactName = from.replace(/<.+?>/, "").trim().replace(/"/g, "") || email
            break
          }
        }

        // Fallback: if all messages are from the user (rare), use the last message
        if (!contactEmail) {
          const fromHeader = getHeader(lastMsg, "From")
          const emailMatch = fromHeader.match(/<(.+?)>/)
          contactEmail = emailMatch ? emailMatch[1] : fromHeader
          contactName = fromHeader.replace(/<.+?>/, "").trim().replace(/"/g, "") || contactEmail
        }

        return {
          id: t.id,
          subject: getHeader(firstMsg, "Subject") || "(no subject)",
          senderEmail: contactEmail,
          senderName: contactName,
          date: getHeader(lastMsg, "Date"),
          messageCount: messages.length,
          snippet: lastMsg?.snippet || "",
          unread: lastMsg?.labelIds?.includes("UNREAD") || false,
        }
      })
    )

    return NextResponse.json({ threads: threadDetails.filter(Boolean), connected: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}