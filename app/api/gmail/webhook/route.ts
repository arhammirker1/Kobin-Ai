/**
 * Gmail Pub/Sub Webhook Endpoint
 *
 * Receives push notifications from Google Pub/Sub when new emails arrive.
 * Flow:
 *   1. Google detects new email → pushes to Pub/Sub topic
 *   2. Pub/Sub forwards to this endpoint as POST
 *   3. We decode the notification, get the user's historyId
 *   4. Fetch new messages via history.list()
 *   5. Match to CRM contacts → queue analysis
 *
 * IMPORTANT: Must return 200 within ~10s or Pub/Sub will retry.
 * Analysis is done fire-and-forget (queued, not inline).
 */

import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshGoogleToken } from "@/lib/google/token"
import { analyzeEmailThread, checkLeadRelevance } from "@/lib/gmail/analyze"
import { NextResponse } from "next/server"

// Pub/Sub sends JSON with this shape:
// { message: { data: "<base64>", messageId: "...", publishTime: "..." }, subscription: "..." }
// The base64-decoded data is: { emailAddress: "user@gmail.com", historyId: "12345" }

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Decode the Pub/Sub message
    const messageData = body?.message?.data
    if (!messageData) {
      // Return 200 anyway — Pub/Sub will retry on non-2xx
      console.warn("[Gmail Webhook] No message data in payload")
      return NextResponse.json({ status: "no_data" })
    }

    const decoded = JSON.parse(Buffer.from(messageData, "base64").toString("utf-8"))
    const { emailAddress, historyId } = decoded

    if (!emailAddress || !historyId) {
      console.warn("[Gmail Webhook] Missing emailAddress or historyId")
      return NextResponse.json({ status: "missing_fields" })
    }

    console.log(`[Gmail Webhook] Notification for ${emailAddress}, historyId=${historyId}`)

    // Look up user by their Google email
    const { data: integration } = await supabaseAdmin
      .from("google_integrations")
      .select("*")
      .ilike("google_email", emailAddress)
      .eq("is_connected", true)
      .single()

    if (!integration) {
      console.warn(`[Gmail Webhook] No integration found for ${emailAddress}`)
      return NextResponse.json({ status: "user_not_found" })
    }

    const userId = integration.user_id
    const storedHistoryId = integration.gmail_history_id

    if (!storedHistoryId) {
      // No stored history ID — can't do incremental sync. 
      // Update historyId for next time and return.
      await supabaseAdmin
        .from("google_integrations")
        .update({ gmail_history_id: historyId, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
      console.log(`[Gmail Webhook] No stored historyId — saved ${historyId} for next time`)
      return NextResponse.json({ status: "initialized" })
    }

    // Dedup: if we already processed this historyId, skip
    if (storedHistoryId === historyId) {
      return NextResponse.json({ status: "duplicate" })
    }

    // Refresh token
    const accessToken = await refreshGoogleToken(integration)

    // Fetch message history since last known historyId
    const historyRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${storedHistoryId}&historyTypes=messageAdded&labelId=INBOX`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    // Update stored historyId regardless of result
    await supabaseAdmin
      .from("google_integrations")
      .update({ gmail_history_id: historyId, updated_at: new Date().toISOString() })
      .eq("user_id", userId)

    if (!historyRes.ok) {
      const errText = await historyRes.text()
      // 404 means historyId is too old — just reset
      if (historyRes.status === 404) {
        console.log(`[Gmail Webhook] History expired for ${emailAddress}, reset to ${historyId}`)
        return NextResponse.json({ status: "history_reset" })
      }
      console.error(`[Gmail Webhook] History fetch failed: ${historyRes.status} ${errText}`)
      return NextResponse.json({ status: "history_error" })
    }

    const historyData = await historyRes.json()
    const historyRecords = historyData.history || []

    if (historyRecords.length === 0) {
      return NextResponse.json({ status: "no_new_messages" })
    }

    // Collect unique new message IDs
    const newMessageIds = new Set<string>()
    for (const record of historyRecords) {
      for (const added of (record.messagesAdded || [])) {
        if (added.message?.id) {
          newMessageIds.add(added.message.id)
        }
      }
    }

    if (newMessageIds.size === 0) {
      return NextResponse.json({ status: "no_added_messages" })
    }

    console.log(`[Gmail Webhook] ${newMessageIds.size} new message(s) for ${emailAddress}`)

    // For each new message, get metadata and match to CRM contact
    const myEmail = (integration.google_email || "").toLowerCase()
    const processedThreads = new Set<string>()
    let analyzed = 0
    let leadsCreated = 0

    // Check if auto-lead detection is enabled for this user
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("settings")
      .eq("id", userId)
      .single()

    const autoDetectLeads = profile?.settings?.auto_detect_leads !== false // default ON

    for (const msgId of newMessageIds) {
      try {
        // Fetch message metadata
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        if (!msgRes.ok) continue

        const msgData = await msgRes.json()
        const threadId = msgData.threadId

        // Skip if we already processed this thread in this batch
        if (processedThreads.has(threadId)) continue
        processedThreads.add(threadId)

        // Extract sender
        const fromHeader = msgData.payload?.headers?.find((h: any) => h.name === "From")?.value || ""
        const subjectHeader = msgData.payload?.headers?.find((h: any) => h.name === "Subject")?.value || ""
        const emailMatch = fromHeader.match(/<(.+?)>/)
        const senderEmail = (emailMatch ? emailMatch[1] : fromHeader).toLowerCase().trim()
        const senderName = fromHeader.replace(/<.+?>/, "").trim().replace(/"/g, "") || senderEmail

        // Skip self-sent messages
        if (senderEmail === myEmail) continue

        // Find matching CRM contact
        const { data: contact } = await supabaseAdmin
          .from("relationships")
          .select("id")
          .eq("user_id", userId)
          .ilike("email", senderEmail)
          .eq("status", "active")
          .maybeSingle()

        if (contact) {
          // Known contact — fire-and-forget analysis
          // Using a Promise that we don't await — the analysis runs in background
          analyzeEmailThread(userId, threadId, contact.id).catch((err) => {
            console.error(`[Gmail Webhook] Analysis failed for thread ${threadId}:`, err)
          })
          analyzed++
        } else if (autoDetectLeads) {
          // Unknown sender — AI checks if they're a relevant lead
          const snippet = msgData.snippet || ""
          const relevance = await checkLeadRelevance(senderEmail, senderName, subjectHeader, snippet)

          if (relevance.relevant) {
            // Auto-create as new lead
            const { data: newRel } = await supabaseAdmin
              .from("relationships")
              .insert({
                user_id: userId,
                full_name: relevance.suggestedName,
                email: senderEmail,
                relationship_type: "lead",
                pipeline_stage: "new_lead",
                status: "active",
                tags: ["auto-detected"],
                pipeline_notes: `Auto-added by AI: ${relevance.reason}`,
              })
              .select("id")
              .single()

            if (newRel) {
              leadsCreated++
              // Fire-and-forget analysis for the new lead
              analyzeEmailThread(userId, threadId, newRel.id).catch((err) => {
                console.error(`[Gmail Webhook] Analysis failed for new lead thread ${threadId}:`, err)
              })
            }
          }
        }
      } catch (msgErr) {
        console.error(`[Gmail Webhook] Error processing message ${msgId}:`, msgErr)
      }
    }

    console.log(`[Gmail Webhook] Done: ${analyzed} analyzed, ${leadsCreated} leads created for ${emailAddress}`)
    return NextResponse.json({ status: "ok", analyzed, leads_created: leadsCreated })
  } catch (err) {
    console.error("[Gmail Webhook] Unexpected error:", err)
    // MUST return 200 or Pub/Sub will retry
    return NextResponse.json({ status: "error", message: String(err) })
  }
}
