// lib/web-push/push-to-user.ts
import { supabaseAdmin } from "@/lib/supabase/admin"
import { sendPushNotification, PushPayload } from "@/lib/web-push/send"

export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    console.log("[pushToUser] Fetching subscriptions for user:", userId)

    const { data: subscriptions, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId)

    if (error) {
      console.error("[pushToUser] DB error fetching subscriptions:", error.message)
      return
    }

    if (!subscriptions?.length) {
      console.log("[pushToUser] No subscriptions found for user:", userId)
      return
    }

    console.log("[pushToUser] Found", subscriptions.length, "subscription(s), sending...")

    await Promise.all(
      subscriptions.map(async (sub) => {
        const result = await sendPushNotification(sub, payload)
        if (!result.success) {
          // Remove expired/rejected subscriptions
          if (result.statusCode === 410 || result.statusCode === 404 || result.statusCode === 401) {
            console.log("[pushToUser] Removing bad subscription:", sub.endpoint.slice(-30))
            await supabaseAdmin
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint)
          }
        }
      })
    )
  } catch (err) {
    console.error("[pushToUser] Unexpected error:", err)
  }
}