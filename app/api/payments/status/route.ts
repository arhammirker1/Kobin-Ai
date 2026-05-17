// app/api/payments/status/route.ts
// GET /api/payments/status?tracker=xxx&order_id=xxx
// Called from the success page to verify payment and upgrade user.

import { NextRequest, NextResponse } from 'next/server'
import { getPaymentStatus } from '@/lib/safepay'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tracker = searchParams.get('tracker')
  const order_id = searchParams.get('order_id')
  const plan = searchParams.get('plan')

  if (!tracker || !order_id) {
    return NextResponse.json({ error: 'tracker and order_id required' }, { status: 400 })
  }

  try {
    const status = await getPaymentStatus(tracker)

    // If paid, upgrade user
    if (status.paid && plan) {
      const db = supabaseAdmin
      const orderParts = order_id.split('_')
      const user_id = orderParts[2]

      if (user_id && ['pro', 'agency'].includes(plan)) {
        await db.from('profiles').update({ plan }).eq('id', user_id)

        const { data: existingSub } = await db
          .from('subscriptions')
          .select('id')
          .eq('founder_id', user_id)
          .maybeSingle()

        if (existingSub) {
          await db
            .from('subscriptions')
            .update({ plan, status: 'active', updated_at: new Date().toISOString() })
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
      }
    }

    return NextResponse.json(status)
  } catch (err: any) {
    console.error('[payments/status] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}