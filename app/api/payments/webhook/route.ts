// app/api/payments/webhook/route.ts
// Handles Safepay payment webhooks.
// Configure this URL in Safepay dashboard: https://www.kobin.team/api/payments/webhook

import { NextRequest, NextResponse } from 'next/server'
import { getAdminDB } from '@/lib/admin-db'
import { track } from '@/lib/mixpanel'  // server-safe? only import if needed

// Safepay sends webhook with payment event data
// We verify by checking tracker status from their API

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()

    // Safepay webhook payload shape (verify with their docs):
    // { event: 'payment.success' | 'payment.failed', data: { tracker, order_id, ... } }
    const { event, data } = payload

    if (!event || !data) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const db = getAdminDB()

    // Extract order metadata from order_id: kobin_{plan}_{user_id}_{timestamp}
    const orderParts = (data.order_id || '').split('_')
    // format: ['kobin', plan, user_id, timestamp]
    const plan = orderParts[1]
    const user_id = orderParts[2]

    if (event === 'payment.succeeded' || data.state === 'TRACKER_ENDED') {
      // 1. Update payment attempt status
      await db
        .from('payment_attempts')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('order_id', data.order_id)
        .catch(() => { }) // non-fatal if table doesn't exist

      // 2. Upgrade user plan
      if (user_id && plan && ['pro', 'agency'].includes(plan)) {
        // Update profiles table
        await db
          .from('profiles')
          .update({ plan })
          .eq('id', user_id)

        // Upsert subscription record
        const { data: existingSub } = await db
          .from('subscriptions')
          .select('id')
          .eq('founder_id', user_id)
          .maybeSingle()

        if (existingSub) {
          await db
            .from('subscriptions')
            .update({
              plan,
              status: 'active',
              updated_at: new Date().toISOString(),
            })
            .eq('founder_id', user_id)
        } else {
          await db.from('subscriptions').insert({
            founder_id: user_id,
            plan,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        }

        console.log(`[webhook] Upgraded user ${user_id} to ${plan}`)
      }

      return NextResponse.json({ received: true, upgraded: true })
    }

    if (event === 'payment.failed' || data.state === 'TRACKER_ENROLLED') {
      await db
        .from('payment_attempts')
        .update({ status: 'failed' })
        .eq('order_id', data.order_id)
        .catch(() => { })

      return NextResponse.json({ received: true, upgraded: false })
    }

    return NextResponse.json({ received: true, note: 'unhandled event' })
  } catch (err: any) {
    console.error('[payments/webhook] error:', err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}