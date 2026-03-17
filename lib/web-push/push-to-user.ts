// lib/web-push/push-to-user.ts
import { supabaseAdmin } from "@/lib/supabase/admin"
import { sendPushNotification, PushPayload } from "@/lib/web-push/send"

const COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    const { data: subscriptions, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, last_notified_at")
      .eq("user_id", userId)

    if (error) {
      console.error("[pushToUser] DB error:", error.message)
      return
    }

    if (!subscriptions?.length) {
      console.log("[pushToUser] No subscriptions for user:", userId)
      return
    }

    // ── Single user-level cooldown check ──────────────────────────────────
    // If ANY subscription for this user was notified within 5 min, skip all
    const now = Date.now()
    const mostRecentNotif = subscriptions
      .map((s) => s.last_notified_at ? new Date(s.last_notified_at).getTime() : 0)
      .reduce((max, t) => Math.max(max, t), 0)

    if (mostRecentNotif && now - mostRecentNotif < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - (now - mostRecentNotif)) / 1000)
      console.log(`[pushToUser] ⏳ User ${userId} in cooldown — skipping (${remaining}s left)`)
      return
    }

    // ── Send to all devices + stamp all with same timestamp ───────────────
    const sentAt = new Date().toISOString()

    await Promise.all(
      subscriptions.map(async (sub) => {
        const result = await sendPushNotification(sub, payload)

        if (result.success) {
          await supabaseAdmin
            .from("push_subscriptions")
            .update({ last_notified_at: sentAt })
            .eq("endpoint", sub.endpoint)
        } else if (
          result.statusCode === 410 ||
          result.statusCode === 404 ||
          result.statusCode === 401
        ) {
          console.log("[pushToUser] Removing bad subscription:", sub.endpoint.slice(-30))
          await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint)
        }
      })
    )

    console.log(`[pushToUser] ✅ Sent push to user ${userId}, cooldown starts now`)
  } catch (err) {
    console.error("[pushToUser] Unexpected error:", err)
  }
}