/**
 * Gmail Push Notifications via Google Pub/Sub.
 *
 * - registerGmailWatch: called after OAuth to start receiving push notifications
 * - renewGmailWatch: called by daily cron to renew the 7-day watch
 *
 * Requires:
 *   - GMAIL_PUBSUB_TOPIC env var (e.g. projects/my-project/topics/gmail-push-notifications)
 *   - Pub/Sub topic must grant publish access to gmail-api-push@system.gserviceaccount.com
 */

import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshGoogleToken } from "@/lib/google/token"

const PUBSUB_TOPIC = process.env.GMAIL_PUBSUB_TOPIC || ""

interface WatchResult {
  success: boolean
  historyId?: string
  expiration?: string
  error?: string
}

/**
 * Register gmail.users.watch() for a user.
 * Gmail will send push notifications to the Pub/Sub topic when new emails arrive.
 * The watch expires after ~7 days and must be renewed.
 */
export async function registerGmailWatch(userId: string): Promise<WatchResult> {
  if (!PUBSUB_TOPIC) {
    console.error("[Gmail Watch] GMAIL_PUBSUB_TOPIC not configured")
    return { success: false, error: "GMAIL_PUBSUB_TOPIC not set" }
  }

  try {
    const { data: integration } = await supabaseAdmin
      .from("google_integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("is_connected", true)
      .single()

    if (!integration) return { success: false, error: "No Google integration found" }

    const accessToken = await refreshGoogleToken(integration)

    // Call gmail.users.watch()
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topicName: PUBSUB_TOPIC,
        labelIds: ["INBOX"],  // Only watch inbox, not spam/trash
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error("[Gmail Watch] Failed:", res.status, errText)
      return { success: false, error: `Gmail watch failed: ${res.status} ${errText}` }
    }

    const data = await res.json()
    // data = { historyId: "12345", expiration: "1680000000000" }

    const historyId = data.historyId
    const expiration = data.expiration
      ? new Date(parseInt(data.expiration)).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    // Save watch state to DB
    await supabaseAdmin
      .from("google_integrations")
      .update({
        gmail_history_id: historyId,
        gmail_watch_expiration: expiration,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)

    console.log(`[Gmail Watch] Registered for user ${userId}, historyId=${historyId}, expires=${expiration}`)
    return { success: true, historyId, expiration }
  } catch (err) {
    console.error("[Gmail Watch] Error:", err)
    return { success: false, error: String(err) }
  }
}

/**
 * Renew gmail watch for a user.
 * Identical to registerGmailWatch — Gmail's watch API is idempotent.
 */
export async function renewGmailWatch(userId: string): Promise<WatchResult> {
  return registerGmailWatch(userId)
}

/**
 * Stop watching for a user (e.g., when disconnecting Google).
 */
export async function stopGmailWatch(userId: string): Promise<void> {
  try {
    const { data: integration } = await supabaseAdmin
      .from("google_integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("is_connected", true)
      .single()

    if (!integration) return

    const accessToken = await refreshGoogleToken(integration)

    await fetch("https://gmail.googleapis.com/gmail/v1/users/me/stop", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    // Clear watch state
    await supabaseAdmin
      .from("google_integrations")
      .update({
        gmail_history_id: null,
        gmail_watch_expiration: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)

    console.log(`[Gmail Watch] Stopped for user ${userId}`)
  } catch (err) {
    console.error("[Gmail Watch] Stop error:", err)
  }
}
