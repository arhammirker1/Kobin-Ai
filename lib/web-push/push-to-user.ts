// lib/web-push/push-to-user.ts
import { supabaseAdmin } from "@/lib/supabase/admin"
import { sendPushNotification, PushPayload } from "@/lib/web-push/send"

const COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    console.log("[pushToUser] Fetching subscriptions for user:", userId)

    const { data: subscriptions, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, last_notified_at")
      .eq("user_id", userId)

    if (error) {
      console.error("[pushToUser] DB error fetching subscriptions:", error.message)
      return
    }

    if (!subscriptions?.length) {
      console.log("[pushToUser] No subscriptions found for user:", userId)
      return
    }

    const now = Date.now()

    await Promise.all(
      subscriptions.map(async (sub) => {
        // ── Cooldown check ─────────────────────────────────────────────────
        if (sub.last_notified_at) {
          const lastSent = new Date(sub.last_notified_at).getTime()
          const elapsed = now - lastSent
          if (elapsed < COOLDOWN_MS) {
            const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000)
            console.log(`[pushToUser] ⏳ Cooldown active — skipping (${remaining}s remaining)`)
            return
          }
        }

        // ── Send ───────────────────────────────────────────────────────────
        const result = await sendPushNotification(sub, payload)

        if (result.success) {
          // Update last_notified_at on success
          await supabaseAdmin
            .from("push_subscriptions")
            .update({ last_notified_at: new Date().toISOString() })
            .eq("endpoint", sub.endpoint)
        } else {
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