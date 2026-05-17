// app/api/payments/checkout/route.ts
// Creates a Safepay payment session and returns a checkout URL.
// Called by the frontend upgrade page.

import { NextRequest, NextResponse } from 'next/server'
import { createPaymentTracker, buildCheckoutUrl } from '@/lib/safepay'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Plan config: amount in PKR lowest denomination (1 PKR = 100 paisas)
// Adjust these to your actual pricing in PKR or USD
const PLANS: Record<string, { amount: number; currency: string; label: string }> = {
  pro: { amount: 8000, currency: 'PKR', label: 'Kobin AI Pro' },
  agency: { amount: 22000, currency: 'PKR', label: 'Kobin AI Agency' },
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { plan, email, phone, user_id } = body

    // Validate plan
    if (!plan || !PLANS[plan]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }
    if (!email || !phone) {
      return NextResponse.json({ error: 'email and phone are required' }, { status: 400 })
    }

    const planConfig = PLANS[plan]
    const order_id = `kobin_${plan}_${user_id || 'guest'}_${Date.now()}`

    // 1. Create a payment tracker via /order/v1/init (matches @sfpy/node-sdk)
    const { token: trackerToken } = await createPaymentTracker({
      amount: planConfig.amount,
      currency: planConfig.currency,
      order_id,
      source: `kobin_${plan}`,
    })

    // 2. Build checkout URL (matches @sfpy/node-sdk checkout.create)
    const origin = req.headers.get('origin') || 'https://app.kobin.team'
    const checkout_url = buildCheckoutUrl({
      token: trackerToken,
      order_id,
      cancel_url: `${origin}/upgrade?cancelled=1`,
      redirect_url: `${origin}/upgrade/success`,
      env: process.env.SAFEPAY_ENV === 'production' ? 'production' : 'sandbox',
      source: 'custom',
      webhooks: true,
    })

    // 3. Log pending payment in DB
    if (user_id) {
      try {
        const db = supabaseAdmin
        await db.from('payment_attempts').insert({
          user_id,
          plan,
          order_id,
          tracker_token: trackerToken,
          amount: planConfig.amount,
          currency: planConfig.currency,
          status: 'pending',
          created_at: new Date().toISOString(),
        })
      } catch {
        // Table may not exist yet — non-fatal
      }
    }

    return NextResponse.json({
      checkout_url,
      tracker: trackerToken,
      order_id,
    })
  } catch (err: any) {
    console.error('[payments/checkout] error:', err)
    return NextResponse.json({
      error: err.message || 'Payment init failed',
      detail: String(err)
    }, { status: 500 })
  }
}