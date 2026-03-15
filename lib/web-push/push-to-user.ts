// lib/web-push/push-to-user.ts
import { supabaseAdmin } from "@/lib/supabase/admin"
import { sendPushNotification, PushPayload } from "@/lib/web-push/send"

/**
 * Send a push notification to a user from any server-side API route.
 * Usage: await pushToUser(userId, { type: "inbox_message", title: "...", body: "..." })
 */
export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    const { data: subscriptions } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId)

    if (!subscriptions?.length) return

    await Promise.all(
      subscriptions.map(async (sub) => {
        const success = await sendPushNotification(sub, payload)
        if (!success) {
          // Remove expired/invalid subscription
          await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint)
        }
      })
    )
  } catch (err) {
    console.warn("pushToUser failed:", err)
  }
}