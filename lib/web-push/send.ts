// lib/web-push/send.ts
import webpush from "web-push"

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export interface PushPayload {
  type: "meeting_reminder" | "task_assigned" | "inbox_message"
  title: string
  body: string
  icon?: string
  badge?: string
  meeting_link?: string
  event_id?: string
  minutes_until?: number
  task_id?: string
  priority?: string
  room_id?: string | null
  sender_name?: string
  message_preview?: string
  message_id?: string
}

export interface PushSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload
): Promise<{ success: boolean; error?: string; statusCode?: number }> {
  try {
    // Log every attempt so we can see it in Vercel logs
    console.log("[push/send] Attempting push to endpoint:", subscription.endpoint.slice(-30))
    console.log("[push/send] Payload type:", payload.type, "| title:", payload.title)

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 }
    )

    console.log("[push/send] ✅ Successfully sent push")
    return { success: true }

  } catch (err: any) {
    const statusCode = err.statusCode || err.status || 0
    const body = err.body || err.message || String(err)

    // Always log the full error — this is the key line we were missing
    console.error(`[push/send] ❌ FAILED — HTTP ${statusCode}:`, body)
    console.error("[push/send] Endpoint was:", subscription.endpoint.slice(-50))

    if (statusCode === 401) {
      console.error("[push/send] 401 = VAPID keys rejected. They may be wrong or mismatched.")
    } else if (statusCode === 410 || statusCode === 404) {
      console.error("[push/send] 410/404 = Subscription expired or invalid.")
    } else if (statusCode === 400) {
      console.error("[push/send] 400 = Bad request — payload or subscription malformed.")
      console.error("[push/send] p256dh length:", subscription.p256dh?.length)
      console.error("[push/send] auth length:", subscription.auth?.length)
    }

    return { success: false, error: body, statusCode }
  }
}