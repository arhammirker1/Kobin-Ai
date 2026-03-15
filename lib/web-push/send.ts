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
  // Meeting specific
  meeting_link?: string
  event_id?: string
  minutes_until?: number
  // Task specific
  task_id?: string
  priority?: string
  // Inbox specific
  room_id?: string
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
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 } // 1 hour TTL
    )
    return true
  } catch (err: any) {
    // 410 Gone = subscription expired, should be deleted
    if (err.statusCode === 410) return false
    console.error("Push send error:", err)
    return false
  }
}