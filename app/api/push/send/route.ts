// app/api/push/send/route.ts
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"
import { sendPushNotification, PushPayload } from "@/lib/web-push/send"

export async function POST(req: Request) {
  // This route is called server-side only (from other API routes)
  // Verify internal secret to prevent abuse
  const authHeader = req.headers.get("x-internal-secret")
  if (authHeader !== process.env.INTERNAL_API_SECRET) {
    // Fallback: allow authenticated users to send to themselves (for testing)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { user_id, payload } = await req.json() as { user_id: string; payload: PushPayload }

  if (!user_id || !payload) {
    return NextResponse.json({ error: "user_id and payload required" }, { status: 400 })
  }

  // Get all subscriptions for this user
  const { data: subscriptions } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user_id)

  if (!subscriptions?.length) {
    return NextResponse.json({ sent: 0 })
  }

  const results = await Promise.all(
    subscriptions.map(async (sub) => {
      const success = await sendPushNotification(sub, payload)
      if (!success) {
        // Remove expired subscription
        await supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", sub.endpoint)
      }
      return success
    })
  )

  const sent = results.filter(Boolean).length
  return NextResponse.json({ sent, total: subscriptions.length })
}