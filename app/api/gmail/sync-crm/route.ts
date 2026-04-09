import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshGoogleToken } from "@/lib/google/token"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { relationship_id } = await request.json().catch(() => ({}))

    const { data: integration } = await supabaseAdmin
      .from("google_integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_connected", true)
      .single()

    if (!integration) return NextResponse.json({ error: "Gmail not connected" }, { status: 400 })

    const accessToken = await refreshGoogleToken(integration)

    let query = supabaseAdmin
      .from("relationships")
      .select("id, full_name, email, pipeline_stage")
      .eq("user_id", user.id)
      .eq("status", "active")
      .not("email", "is", null)

    if (relationship_id) query = query.eq("id", relationship_id)

    const { data: relationships } = await query.limit(40)
    if (!relationships?.length) return NextResponse.json({ synced: 0 })

    let synced = 0
  const contactsNeedingAnalysis: string[] = []

    for (const rel of relationships) {
      if (!rel.email) continue
      try {
        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=8&q=${encodeURIComponent(`from:${rel.email} OR to:${rel.email}`)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        if (!listRes.ok) continue
        const { threads = [] } = await listRes.json()

        let lastInbound: number | null = null
        let lastOutbound: number | null = null

        for (const thread of threads) {
          const tRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          if (!tRes.ok) continue
          const tData = await tRes.json()
          const messages = tData.messages || []
          if (!messages.length) continue

          const lastMsg = messages[messages.length - 1]
          const getHeader = (msg: any, name: string) =>
            msg?.payload?.headers?.find((h: any) => h.name === name)?.value || ""

          const fromHeader = getHeader(lastMsg, "From")
          const emailMatch = fromHeader.match(/<(.+?)>/)
          const senderEmail = (emailMatch ? emailMatch[1] : fromHeader).toLowerCase()
          const senderName = fromHeader.replace(/<.+?>/, "").trim().replace(/"/g, "") || senderEmail
          const lastDate = lastMsg?.internalDate ? new Date(parseInt(lastMsg.internalDate)).toISOString() : null
          const isUnread = lastMsg?.labelIds?.includes("UNREAD") || false

          await supabaseAdmin.from("gmail_threads").upsert({
            id: thread.id,
            user_id: user.id,
            relationship_id: rel.id,
            subject: getHeader(messages[0], "Subject") || "(no subject)",
            snippet: lastMsg?.snippet || "",
            sender_email: senderEmail,
            sender_name: senderName,
            is_unread: isUnread,
            message_count: messages.length,
            last_message_at: lastDate,
            updated_at: new Date().toISOString(),
          }, { onConflict: "id,user_id" })

          // Track inbound/outbound for last contact dates
          for (const msg of messages) {
            const from = getHeader(msg, "From").toLowerCase()
            const ts = msg.internalDate ? parseInt(msg.internalDate) : null
            if (!ts) continue
            if (from.includes(rel.email!.toLowerCase())) {
              if (!lastInbound || ts > lastInbound) lastInbound = ts
            } else {
              if (!lastOutbound || ts > lastOutbound) lastOutbound = ts
            }
          }
        }

        const updates: any = {}
        if (lastInbound) updates.last_inbound_at = new Date(lastInbound).toISOString()
        if (lastOutbound) updates.last_outbound_at = new Date(lastOutbound).toISOString()
        if (Object.keys(updates).length) {
        await supabaseAdmin.from("relationships").update(updates).eq("id", rel.id)
      }
      // Track contacts with genuinely new inbound emails not yet analyzed
      if (lastInbound) {
        const { data: lastAnalysis } = await supabaseAdmin
          .from("email_analyses")
          .select("analyzed_at")
          .eq("user_id", user.id)
          .eq("contact_id", rel.id)
          .order("analyzed_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        const lastAnalyzedTs = lastAnalysis?.analyzed_at
          ? new Date(lastAnalysis.analyzed_at).getTime()
          : 0
        const lastInboundTs = lastInbound // already a number (ms)
        // Only flag if new email arrived MORE THAN 1 minute after last analysis
        // (prevents reflagging on the same sync pass)
        if (lastInboundTs > lastAnalyzedTs + 60_000) {
          contactsNeedingAnalysis.push(rel.id)
        }
      }
      synced++
    } catch (e) {
      console.error(`[CRM Sync] Error for ${rel.full_name}:`, e)
    }
  }

  return NextResponse.json({ synced, contacts_with_new_emails: contactsNeedingAnalysis })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}