import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshGoogleToken } from "@/lib/google/token"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // ── Plan enforcement — Gmail requires Pro+ ──────────────────────────────
    const { requireFeature } = await import("@/lib/plan-guard")
    const guard = await requireFeature(user.id, "gmail_integration")
    if (guard) return guard

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
    const crmOnly = searchParams.get("crm_only") === "true"

    let query = fromEmail ? `from:${fromEmail}` : "in:inbox"

    if (crmOnly && !fromEmail) {
      const { data: crmContacts } = await supabaseAdmin
        .from("relationships")
        .select("email")
        .eq("user_id", user.id)
        .not("email", "is", null)
        .eq("status", "active")
      const crmEmails = crmContacts?.map(r => r.email).filter(Boolean) || []
      if (crmEmails.length > 0) {
        query = crmEmails.slice(0, 25).map(e => `from:${e} OR to:${e}`).join(" OR ")
      } else {
        return NextResponse.json({ threads: [], connected: true })
      }
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

    // User's own email — used to identify "self" messages and find the external participant
    const myEmail = (integration.google_email || "").toLowerCase()

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

        // Find the external (non-self) participant — scan all messages for a From that isn't us
        let senderEmail = ""
        let senderName = ""
        for (const msg of messages) {
          const from = getHeader(msg, "From")
          const match = from.match(/<(.+?)>/)
          const email = (match ? match[1] : from).toLowerCase().trim()
          if (email && email !== myEmail) {
            senderEmail = match ? match[1] : from
            senderName = from.replace(/<.+?>/, "").trim().replace(/"/g, "") || senderEmail
            break
          }
        }

        // Fallback: if all messages are from self (e.g. user initiated), use first message From
        if (!senderEmail) {
          const from = getHeader(firstMsg, "From")
          const match = from.match(/<(.+?)>/)
          senderEmail = match ? match[1] : from
          senderName = from.replace(/<.+?>/, "").trim().replace(/"/g, "") || senderEmail
        }

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