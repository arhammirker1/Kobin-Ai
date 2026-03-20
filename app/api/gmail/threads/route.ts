import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshGoogleToken } from "@/lib/google/token"
import { NextResponse } from "next/server"

export async function GET() {
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

    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=20&q=in:inbox",
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

        const getHeader = (msg: any, name: string) =>
          msg?.payload?.headers?.find((h: any) => h.name === name)?.value || ""

        const fromHeader = getHeader(lastMsg, "From")
        const emailMatch = fromHeader.match(/<(.+?)>/)
        const senderEmail = emailMatch ? emailMatch[1] : fromHeader
        const senderName = fromHeader.replace(/<.+?>/, "").trim().replace(/"/g, "") || senderEmail

        return {
          id: t.id,
          subject: getHeader(firstMsg, "Subject") || "(no subject)",
          senderEmail,
          senderName,
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