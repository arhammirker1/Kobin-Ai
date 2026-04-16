// lib/safepay.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-SIDE ONLY — Safepay API wrapper
// Env vars: SAFEPAY_SECRET_KEY, SAFEPAY_PUBLIC_KEY
// Sandbox base: https://sandbox.api.getsafepay.com
// Production base: https://api.getsafepay.com
// ─────────────────────────────────────────────────────────────────────────────

const SAFEPAY_BASE =
  process.env.SAFEPAY_ENV === 'production'
    ? 'https://api.getsafepay.com'
    : 'https://sandbox.api.getsafepay.com'

const SECRET_KEY = process.env.SAFEPAY_SECRET_KEY!
const PUBLIC_KEY = process.env.SAFEPAY_PUBLIC_KEY!

if (!SECRET_KEY || !PUBLIC_KEY) {
  throw new Error('[safepay] SAFEsPAY_SECRET_KEY or SAFEPAY_PUBLIC_KEY not set — check your .env.local')
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface SafepayOrderPayload {
  amount: number          // in lowest denomination (e.g. paisas for PKR)
  currency: 'PKR' | 'USD'
  order_id: string        // your internal order reference
  source?: string         // e.g. 'kobin_upgrade'
  cancel_url?: string
  redirect_url?: string   // success redirect
  webhook_url?: string
}

export interface SafepayOrderResponse {
  token: string           // tracker token used in checkout URL
  checkout_url: string    // full URL to redirect user to
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function safepayFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${SAFEPAY_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-SFPY-MERCHANT-SECRET': SECRET_KEY,
      ...(options.headers || {}),
    },
  })

  const rawText = await res.text()

  let json: any = null
  try {
    json = JSON.parse(rawText)
  } catch {
    throw new Error(`Safepay ${res.status} — non-JSON response: ${rawText.slice(0, 200)}`)
  }

  if (!res.ok) {
    throw new Error(
      json?.status?.errors?.[0] || json?.error || `Safepay ${res.status}: ${JSON.stringify(json)}`
    )
  }

  return json
}

// ── Create a guest JWT (for anonymous/pre-auth checkout) ─────────────────────

export async function createGuestToken(params: {
  email: string
  phone: string
  country?: string
  first_name?: string
  last_name?: string
}): Promise<{ session: string; token: string }> {
  const json = await safepayFetch<any>('/user/v1/guest/', {
    method: 'POST',
    body: JSON.stringify({
      email: params.email,
      phone: params.phone,
      country: params.country || 'PK',
      first_name: params.first_name || '',
      last_name: params.last_name || '',
    }),
  })
  return json.data
}

// ── Create a payment tracker (order session) ─────────────────────────────────
// Safepay uses /order/v1/ to create a tracker token

export async function createPaymentTracker(payload: {
  amount: number
  currency: string
  order_id: string
  source?: string
}): Promise<{ token: string }> {
  const environment = process.env.SAFEPAY_ENV === 'production' ? 'production' : 'sandbox'
  const json = await safepayFetch<any>('/order/v1/init', {
    method: 'POST',
    body: JSON.stringify({
      client: PUBLIC_KEY,
      amount: payload.amount,
      currency: payload.currency,
      environment,
    }),
  })
  const token = json?.data?.token
  if (!token) {
    console.error('[safepay] createPaymentTracker: unexpected response shape:', JSON.stringify(json))
    throw new Error('Safepay did not return a tracker token. Check the response shape above.')
  }
  return { token }
}

// ── Create a passport / authentication token ──────────────────────────────────
// Required by Safepay Express Checkout — short-lived token (1 hour) that
// authorises the checkout session on the client side.

export async function createPassportToken(): Promise<string> {
  const json = await safepayFetch<any>('/client/passport/v1/token', {
    method: 'POST',
  })
  // Response shape: { data: "<token_string>" }
  const token = json?.data
  if (!token || typeof token !== 'string') {
    console.error('[safepay] createPassportToken: unexpected response:', JSON.stringify(json))
    throw new Error('Safepay did not return a passport token.')
  }
  return token
}

// ── Build hosted checkout URL ─────────────────────────────────────────────────
// Per @sfpy/node-sdk the URL requires:
//   beacon        – tracker token from createPaymentTracker
//   env           – 'sandbox' | 'production'
//   source        – 'custom' | 'hosted' | 'popup' | 'mobile'
//   order_id      – your internal order reference
//   redirect_url  – success redirect
//   cancel_url    – cancellation redirect
//   webhooks      – 'true' | 'false'

export function buildCheckoutUrl(params: {
  token: string
  order_id: string
  cancel_url: string
  redirect_url: string
  env?: 'sandbox' | 'production'
  source?: string
  webhooks?: boolean
}): string {
  const base =
    params.env === 'production'
      ? 'https://getsafepay.com/checkout'
      : 'https://sandbox.api.getsafepay.com/checkout'

  if (!params.token) {
    throw new Error('[safepay] buildCheckoutUrl: tracker token is missing or undefined')
  }

  const environment = params.env === 'production' ? 'production' : 'sandbox'

  const qsObj: Record<string, string> = {
    beacon: params.token,
    cancel_url: params.cancel_url,
    env: environment,
    order_id: params.order_id,
    redirect_url: params.redirect_url,
    source: params.source || 'custom',
    webhooks: String(params.webhooks ?? true),
  }

  const qs = new URLSearchParams(qsObj)
  return `${base}/pay?${qs.toString()}`
}

// ── Retrieve order/payment status ─────────────────────────────────────────────

export async function getPaymentStatus(tracker_token: string): Promise<{
  state: string
  paid: boolean
  amount: number
  currency: string
}> {
  const json = await safepayFetch<any>(`/order/v1/${tracker_token}`)
  const tracker = json?.data?.tracker || json?.data || {}

  return {
    state: tracker.state || 'unknown',
    paid: tracker.state === 'COMPLETE' || tracker.state === 'TRACKER_ENDED',
    amount: tracker.amount || tracker.purchase_totals?.base_amount?.amount,
    currency: tracker.currency || tracker.purchase_totals?.base_amount?.currency,
  }
}

// ── Subscription Plans ────────────────────────────────────────────────────────

export async function createPlan(params: {
  amount: number
  currency: string
  interval: 'MONTH' | 'YEAR' | 'DAY' | 'WEEK'
  interval_count?: number
  product: string
  name?: string
  trial_period_days?: number
}): Promise<{ plan_id: string }> {
  const json = await safepayFetch<any>('/client/plans/v1/', {
    method: 'POST',
    body: JSON.stringify({
      amount: String(params.amount),
      currency: params.currency,
      interval: params.interval,
      interval_count: params.interval_count || 1,
      type: 'RECURRING',
      product: params.product,
      active: true,
      name: params.name || params.product,
      trial_period_days: params.trial_period_days || 0,
    }),
  })
  return { plan_id: json?.data?.plan_id }
}

export async function getPlan(plan_id: string) {
  const json = await safepayFetch<any>(`/client/plans/v1/${plan_id}/`)
  return json?.data?.plan
}

export { SAFEPAY_BASE, SECRET_KEY, PUBLIC_KEY }