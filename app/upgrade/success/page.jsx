'use client'
// app/upgrade/success/page.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Post-payment success page.
// Verifies payment via /api/payments/status, upgrades user, tracks with Mixpanel.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Nav from '../../../components/Nav'
import { track } from '../../../lib/mixpanel'

const KernMark = ({ size = 16 }) => (
  <svg viewBox="0 0 512 512" fill="none" width={size} height={size}>
    <rect width="512" height="512" rx="116" fill="#0D0D0C" />
    <rect x="148" y="128" width="52" height="256" rx="26" fill="#F0EDE6" />
    <line x1="196" y1="238" x2="352" y2="108" stroke="#F0EDE6" strokeWidth="52" strokeLinecap="round" />
    <line x1="196" y1="272" x2="352" y2="402" stroke="#F0EDE6" strokeWidth="52" strokeLinecap="round" />
    <circle cx="196" cy="256" r="34" fill="#5B4FE8" />
  </svg>
)

function SuccessContent() {
  const searchParams = useSearchParams()
  const tracker  = searchParams.get('tracker')
  const order_id = searchParams.get('order_id')
  
  // Extract plan from order_id (format: kobin_plan_userid_time) if it's not in the URL
  const planFromOrder = order_id ? order_id.split('_')[1] : null;
  const plan     = searchParams.get('plan') || planFromOrder || 'pro'

  const [status, setStatus] = useState('verifying') // verifying | success | failed | error
  const [attempts, setAttempts] = useState(0)

  useEffect(() => {
    if (!tracker || !order_id) {
      setStatus('error')
      return
    }

    track('Payment Success Page Loaded', { plan, tracker, order_id })
    verifyPayment()
  }, [])

  // Poll up to 5 times (Safepay may be slightly delayed)
  async function verifyPayment(attempt = 0) {
    if (attempt > 4) {
      setStatus('error')
      track('Payment Verification Failed', { plan, tracker, order_id, attempts: attempt })
      return
    }

    setAttempts(attempt + 1)

    try {
      const res = await fetch(
        `/api/payments/status?tracker=${encodeURIComponent(tracker)}&order_id=${encodeURIComponent(order_id)}&plan=${plan}`
      )
      const data = await res.json()

      if (data.paid) {
        setStatus('success')
        track('Payment Verified', { plan, order_id, amount: data.amount, currency: data.currency })
        return
      }

      // Not paid yet — wait and retry
      setTimeout(() => verifyPayment(attempt + 1), 2000)
    } catch (err) {
      console.error('[success page] verify error:', err)
      setTimeout(() => verifyPayment(attempt + 1), 2000)
    }
  }

  const planLabel = plan === 'agency' ? 'Agency' : 'Pro'

  return (
    <>
      <Nav />
      <div style={{
        paddingTop:  '56px',
        background:  '#F6F4EF',
        minHeight:   '100vh',
        fontFamily:  "'Geist', sans-serif",
        display:     'flex',
        alignItems:  'center',
        justifyContent: 'center',
      }}>
        <div style={{ maxWidth: '520px', width: '100%', padding: '40px 24px', textAlign: 'center' }}>

          {/* ── Verifying ── */}
          {status === 'verifying' && (
            <>
              <div style={{
                width: '64px', height: '64px', borderRadius: '16px',
                background: '#0E0E0D', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px',
              }}>
                <svg width="28" height="28" viewBox="0 0 28 28"
                  style={{ animation: 'spin 0.9s linear infinite' }}>
                  <circle cx="14" cy="14" r="10" stroke="#4C3FD4" strokeWidth="2.5"
                    fill="none" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
              </div>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: '28px', fontWeight: 300, letterSpacing: '-0.03em', color: '#0E0E0D', marginBottom: '8px' }}>
                Verifying payment…
              </h1>
              <p style={{ fontSize: '14px', color: '#9C9890' }}>
                Checking with Safepay {attempts > 1 ? `(attempt ${attempts}/5)` : ''}
              </p>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </>
          )}

          {/* ── Success ── */}
          {status === 'success' && (
            <>
              <div style={{
                width: '72px', height: '72px', borderRadius: '18px',
                background: 'rgba(13,107,79,0.1)',
                border: '1px solid rgba(13,107,79,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px',
              }}>
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M7 16l6 6 12-12" stroke="#0D6B4F" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '4px 12px', borderRadius: '100px',
                background: 'rgba(13,107,79,0.08)', border: '1px solid rgba(13,107,79,0.2)',
                fontSize: '11px', color: '#0D6B4F',
                fontFamily: "'Geist Mono', monospace", letterSpacing: '0.05em',
                textTransform: 'uppercase', marginBottom: '16px',
              }}>
                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#0D6B4F' }} />
                Payment confirmed
              </div>

              <h1 style={{
                fontFamily:    "'Fraunces', serif",
                fontSize:      'clamp(28px, 4vw, 40px)',
                fontWeight:    300,
                letterSpacing: '-0.03em',
                color:         '#0E0E0D',
                lineHeight:    1.1,
                marginBottom:  '12px',
              }}>
                Welcome to<br /><em style={{ color: '#4C3FD4' }}>Kobin AI {planLabel}.</em>
              </h1>

              <p style={{ fontSize: '15px', color: '#7A776F', lineHeight: 1.6, marginBottom: '32px' }}>
                Your workspace has been upgraded. All {planLabel} features are now active.
              </p>

              {/* Next steps */}
              <div style={{
                background: '#0E0E0D', borderRadius: '16px',
                padding: '24px', marginBottom: '24px', textAlign: 'left',
              }}>
                <div style={{
                  fontSize: '11px', color: '#555552', fontFamily: "'Geist Mono', monospace",
                  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '14px',
                }}>
                  Your next steps
                </div>
                {[
                  plan === 'pro'    && '→ Connect Gmail in Settings → Integrations',
                  plan === 'pro'    && '→ Sync your Google Calendar',
                  plan === 'pro'    && '→ Open the AI Command Bar with ⌘K',
                  plan === 'agency' && '→ Start your first meeting recording',
                  plan === 'agency' && '→ Enable Proactive AI briefings',
                  plan === 'agency' && '→ Set up your white-label client portal',
                ].filter(Boolean).map((step, i) => (
                  <div key={i} style={{
                    fontSize: '13px', color: '#D8D5CE', padding: '6px 0',
                    borderBottom: i < 2 ? '1px solid #1A1A18' : 'none',
                  }}>
                    {step}
                  </div>
                ))}
              </div>

              <a
                href="https://app.kobin.team"
                style={{
                  display:        'block',
                  padding:        '14px 24px',
                  background:     '#4C3FD4',
                  color:          '#fff',
                  borderRadius:   '10px',
                  fontSize:       '15px',
                  fontWeight:     500,
                  textDecoration: 'none',
                  marginBottom:   '12px',
                  transition:     'background 0.15s',
                }}
                onClick={() => track('Open App Clicked', { plan, source: 'success_page' })}
              >
                Open Kobin AI →
              </a>
              <Link href="/" style={{ fontSize: '13px', color: '#9C9890', textDecoration: 'none', fontFamily: "'Geist Mono', monospace" }}>
                Back to home
              </Link>
            </>
          )}

          {/* ── Error / unverified ── */}
          {(status === 'failed' || status === 'error') && (
            <>
              <div style={{
                width: '64px', height: '64px', borderRadius: '16px',
                background: 'rgba(192,59,48,0.08)', border: '1px solid rgba(192,59,48,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px',
              }}>
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M14 8v7M14 19h.01" stroke="#C03B30" strokeWidth="2"
                    strokeLinecap="round" />
                  <circle cx="14" cy="14" r="11" stroke="#C03B30" strokeWidth="1.5" />
                </svg>
              </div>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: '28px', fontWeight: 300, letterSpacing: '-0.03em', color: '#0E0E0D', marginBottom: '12px' }}>
                Couldn't verify payment
              </h1>
              <p style={{ fontSize: '14px', color: '#7A776F', lineHeight: 1.6, marginBottom: '24px' }}>
                Your payment may still have gone through. Please check your email for a Safepay receipt.
                If you were charged but your plan wasn't upgraded, email us at{' '}
                <a href="mailto:support@kobin.team" style={{ color: '#4C3FD4' }}>
                  support@kobin.team
                </a>{' '}
                with your order ID: <code style={{ fontSize: '12px', background: '#EDE9E1', padding: '2px 5px', borderRadius: '4px' }}>{order_id}</code>
              </p>
              <Link href="/upgrade" style={{
                display: 'inline-block', padding: '12px 22px',
                background: '#0E0E0D', color: '#F0EDE6', borderRadius: '10px',
                fontSize: '14px', textDecoration: 'none',
              }}>
                Try Again
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div style={{ paddingTop: '100px', textAlign: 'center', color: '#9C9890', fontFamily: 'Geist, sans-serif' }}>Loading…</div>}>
      <SuccessContent />
    </Suspense>
  )
}