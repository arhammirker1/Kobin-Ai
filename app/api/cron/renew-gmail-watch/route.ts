/**
 * Daily cron job to renew Gmail push notification watches.
 * Gmail watches expire after ~7 days. This runs daily and renews
 * any watches expiring within the next 2 days.
 *
 * Scheduled via vercel.json: "0 6 * * *" (6am UTC daily)
 */

import { supabaseAdmin } from "@/lib/supabase/admin"
import { renewGmailWatch } from "@/lib/google/gmail-watch"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Find all users whose watch expires within the next 2 days
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()

    const { data: integrations } = await supabaseAdmin
      .from("google_integrations")
      .select("user_id, google_email, gmail_watch_expiration")
      .eq("is_connected", true)
      .not("gmail_history_id", "is", null)  // only users with active watches
      .or(`gmail_watch_expiration.is.null,gmail_watch_expiration.lt.${twoDaysFromNow}`)

    if (!integrations?.length) {
      return NextResponse.json({ renewed: 0, message: "No watches need renewal" })
    }

    let renewed = 0
    let failed = 0
    const errors: string[] = []

    for (const integration of integrations) {
      const result = await renewGmailWatch(integration.user_id)
      if (result.success) {
        renewed++
        console.log(`[Watch Cron] Renewed for ${integration.google_email}, expires ${result.expiration}`)
      } else {
        failed++
        errors.push(`${integration.google_email}: ${result.error}`)
        console.error(`[Watch Cron] Failed for ${integration.google_email}: ${result.error}`)
      }
    }

    return NextResponse.json({ renewed, failed, errors: errors.slice(0, 5) })
  } catch (err) {
    console.error("[Watch Cron] Unexpected error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
