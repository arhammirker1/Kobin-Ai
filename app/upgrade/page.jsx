'use client'
// app/upgrade/page.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Upgrade page — shown when a user hits a plan/feature paywall.
// Includes plan comparison, Safepay checkout, and full Mixpanel tracking.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Nav from '../../components/Nav'
import SafepayCheckout from '../../components/SafepayCheckout'
import { track } from '../../lib/mixpanel'

// ── Kobin mark SVG ────────────────────────────────────────────────────────────
const KernMark = ({ size = 16 }) => (
  <svg viewBox="0 0 512 512" fill="none" width={size} height={size}>
    <rect width="512" height="512" rx="116" fill="#0D0D0C" />
    <rect x="148" y="128" width="52" height="256" rx="26" fill="#F0EDE6" />
    <line x1="196" y1="238" x2="352" y2="108" stroke="#F0EDE6" strokeWidth="52" strokeLinecap="round" />
    <line x1="196" y1="272" x2="352" y2="402" stroke="#F0EDE6" strokeWidth="52" strokeLinecap="round" />
    <circle cx="196" cy="256" r="34" fill="#5B4FE8" />
  </svg>
)

// ── Feature lists ─────────────────────────────────────────────────────────────
const PRO_FEATURES = [
  'Unlimited team members',
  'Unlimited projects & clients',
  '50 GB vault storage',
  'Gmail integration',
  'CRM pipeline',
  'Google Calendar sync',
  'AI Command Bar (⌘K)',
  'Semantic vault search',
  'Workspace intelligence',
  'Push notifications',
]

const AGENCY_FEATURES = [
  'Everything in Pro',
  '500 GB vault storage',
  'Meeting recorder + transcription',
  'AI Writer (vault-powered)',
  'Vault RAG (AI reads your files)',
  'Proactive AI briefings',
  'AI memory system',
  'Auto lead detection',
  'White-label client portal',
  'Priority support',
]

// ── Check icon ────────────────────────────────────────────────────────────────
const Check = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="7" cy="7" r="6.5" fill="rgba(13,107,79,0.12)" />
    <path d="M4.5 7l1.8 1.8 3.2-3.6" stroke="#0D6B4F" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// ── Main component (wrapped for useSearchParams) ──────────────────────────────
function UpgradeContent() {
  const searchParams  = useSearchParams()
  const cancelled     = searchParams.get('cancelled')
  const preselect     = searchParams.get('plan') ?? 'pro'
  const featureHit    = searchParams.get('feature')   // e.g. 'crm', 'gmail'
  const [selected, setSelected] = useState(preselect === 'agency' ? 'agency' : 'pro')

  const [user, setUser] = useState(null)
  const [loadingUser, setLoadingUser] = useState(true)

  // ── Grab session so we don't check out as "guest"
  useEffect(() => {
    import('../../lib/supabase/client').then(({ createClient }) => {
      const supabase = createClient()
      if (!supabase) return
      
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user) {
          setUser(data.user)
          setLoadingUser(false)
        } else {
          // If they reached /upgrade but aren't logged in, redirect them immediately to login
          window.location.href = `/login?intent=upgrade&plan=${preselect}`
        }
      })
    })
  }, [preselect])

  // ── Track page view ──────────────────────────────────────────────────────
  useEffect(() => {
    track('Upgrade Page Viewed', {
      preselected_plan: preselect,
      cancelled:        !!cancelled,
      feature_wall_hit: featureHit ?? null,
    })
  }, [])

  // ── Track plan toggle ────────────────────────────────────────────────────
  function selectPlan(plan) {
    setSelected(plan)
    track('Plan Toggled', { plan, source: 'upgrade_page' })
  }

  const features = selected === 'agency' ? AGENCY_FEATURES : PRO_FEATURES
  const price    = selected === 'agency' ? 'PKR 22,000' : 'PKR 8,000'

  if (loadingUser) {
    return <div style={{ paddingTop: '100px', textAlign: 'center', fontFamily: 'Geist, sans-serif', color: '#9C9890' }}>Loading…</div>
  }

  return (
    <>
      <Nav />
      <div style={{
        paddingTop:   '56px',
        background:   '#F6F4EF',
        minHeight:    '100vh',
        fontFamily:   "'Geist', sans-serif",
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '64px 24px 120px' }}>

          {/* Breadcrumb */}
          <div style={{
            fontSize: '13px', color: '#9C9890', marginBottom: '48px',
            fontFamily: "'Geist Mono', monospace",
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <Link href="/" style={{ color: '#9C9890', textDecoration: 'none' }}>
              kobin ai
            </Link>
            <span>›</span>
            <span>upgrade</span>
          </div>

          {/* Cancelled banner */}
          {cancelled && (
            <div style={{
              padding:      '12px 16px',
              background:   'rgba(192,59,48,0.06)',
              border:       '1px solid rgba(192,59,48,0.2)',
              borderRadius: '10px',
              fontSize:     '13px',
              color:        '#C03B30',
              marginBottom: '24px',
              display:      'flex',
              alignItems:   'center',
              gap:          '8px',
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6.5" stroke="#C03B30" strokeWidth="1.2" />
                <path d="M7 4v3.5M7 10h.01" stroke="#C03B30" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              Payment was cancelled. You can try again below.
            </div>
          )}

          {/* Feature wall message */}
          {featureHit && (
            <div style={{
              padding:      '14px 18px',
              background:   'rgba(76,63,212,0.06)',
              border:       '1px solid rgba(76,63,212,0.18)',
              borderRadius: '10px',
              fontSize:     '14px',
              color:        '#4C3FD4',
              marginBottom: '32px',
              display:      'flex',
              alignItems:   'center',
              gap:          '10px',
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1l1.8 3.6L14 5.6l-3 2.9.7 4.1L8 10.5l-3.7 2.1.7-4.1-3-2.9 4.2-.9L8 1z"
                  fill="#4C3FD4" />
              </svg>
              The <strong>{featureHit}</strong> feature is available on Pro and above.
              Upgrade to unlock it instantly.
            </div>
          )}

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div style={{
              display:     'inline-flex',
              alignItems:  'center',
              gap:         '8px',
              padding:     '6px 14px',
              background:  'rgba(76,63,212,0.08)',
              border:      '1px solid rgba(76,63,212,0.18)',
              borderRadius: '100px',
              fontSize:    '12px',
              color:       '#4C3FD4',
              marginBottom: '20px',
              fontFamily:  "'Geist Mono', monospace",
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#4C3FD4' }} />
              Early Founder Pricing
            </div>
            <h1 style={{
              fontFamily:    "'Fraunces', serif",
              fontSize:      'clamp(36px, 4vw, 56px)',
              fontWeight:    300,
              letterSpacing: '-0.03em',
              color:         '#0E0E0D',
              lineHeight:    1.1,
              marginBottom:  '16px',
            }}>
              Unlock your full<br /><em style={{ color: '#4C3FD4' }}>agency workspace.</em>
            </h1>
            <p style={{ fontSize: '16px', color: '#7A776F', maxWidth: '480px', margin: '0 auto', lineHeight: 1.6 }}>
              Replace Slack, Notion, HubSpot, and Linear. One workspace, one invoice.
              Lock in founding pricing before public launch.
            </p>
          </div>

          {/* Plan Toggle */}
          <div style={{
            display:        'flex',
            justifyContent: 'center',
            gap:            '0',
            marginBottom:   '40px',
            background:     '#EDE9E1',
            borderRadius:   '12px',
            padding:        '4px',
            maxWidth:       '320px',
            margin:         '0 auto 40px',
          }}>
            {[
              { key: 'pro',    label: 'Pro — PKR 8K/mo'    },
              { key: 'agency', label: 'Agency — PKR 22K/mo' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => selectPlan(key)}
                style={{
                  flex:         1,
                  padding:      '10px 12px',
                  borderRadius: '9px',
                  border:       'none',
                  cursor:       'pointer',
                  fontSize:     '13px',
                  fontWeight:   selected === key ? 600 : 400,
                  color:        selected === key ? '#0E0E0D' : '#9C9890',
                  background:   selected === key ? '#fff' : 'transparent',
                  boxShadow:    selected === key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition:   'all 0.15s ease',
                  fontFamily:   "'Geist', sans-serif",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Main grid */}
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap:                 '24px',
            alignItems:          'start',
          }}>

            {/* ── Plan card ── */}
            <div style={{
              background:   '#0E0E0D',
              borderRadius: '20px',
              overflow:     'hidden',
              color:        '#F0EDE6',
            }}>
              {/* Top accent */}
              <div style={{ height: '3px', background: 'linear-gradient(90deg, #4C3FD4, #6358E8)' }} />

              <div style={{ padding: '32px' }}>
                {/* Badge */}
                {selected === 'pro' && (
                  <div style={{
                    display:      'inline-flex',
                    alignItems:   'center',
                    gap:          '6px',
                    padding:      '4px 10px',
                    background:   'rgba(76,63,212,0.2)',
                    borderRadius: '100px',
                    fontSize:     '11px',
                    color:        '#8B81F8',
                    marginBottom: '16px',
                    fontFamily:   "'Geist Mono', monospace",
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#8B81F8' }} />
                    Most Popular
                  </div>
                )}

                {/* Plan name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '8px',
                    background: '#4C3FD4', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <KernMark size={16} />
                  </div>
                  <span style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em' }}>
                    Kobin AI {selected === 'agency' ? 'Agency' : 'Pro'}
                  </span>
                </div>

                {/* Price */}
                <div style={{ marginBottom: '6px' }}>
                  <span style={{
                    fontFamily:    "'Fraunces', serif",
                    fontSize:      '48px',
                    fontWeight:    300,
                    letterSpacing: '-0.03em',
                    lineHeight:    1,
                  }}>
                    {price}
                  </span>
                  <span style={{ fontSize: '14px', color: '#555552', marginLeft: '6px' }}>
                    / month
                  </span>
                </div>

                <p style={{ fontSize: '13px', color: '#555552', marginBottom: '24px', lineHeight: 1.5 }}>
                  {selected === 'agency'
                    ? 'For agencies at scale. Advanced AI, meeting recording, and white-label portal.'
                    : 'For founders with a team. Gmail, CRM, Calendar, and AI — all in one workspace.'
                  }
                </p>

                {/* Features */}
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#D8D5CE' }}>
                      <Check />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* 14-day trial note */}
                <div style={{
                  padding:      '10px 14px',
                  background:   'rgba(13,107,79,0.12)',
                  border:       '1px solid rgba(13,107,79,0.2)',
                  borderRadius: '8px',
                  fontSize:     '12px',
                  color:        '#3DB88A',
                  marginBottom: '20px',
                  display:      'flex',
                  alignItems:   'center',
                  gap:          '8px',
                }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <circle cx="6.5" cy="6.5" r="5.8" stroke="#3DB88A" strokeWidth="1.2" />
                    <path d="M4.5 6.5l1.5 1.5 2.5-3" stroke="#3DB88A" strokeWidth="1.2"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  14-day free trial · No credit card stored by Kobin
                </div>

                {/* Checkout button */}
                <SafepayCheckout
                  plan={selected}
                  userId={user?.id}
                  userEmail={user?.email}
                  style={{ width: '100%', padding: '14px', fontSize: '15px', background: '#4C3FD4' }}
                  buttonLabel={`Start ${selected === 'agency' ? 'Agency' : 'Pro'} Trial →`}
                />
              </div>
            </div>

            {/* ── Right column: trust signals + FAQ ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Safepay trust badge */}
              <div style={{
                background:   '#fff',
                border:       '1px solid #E0DDD6',
                borderRadius: '16px',
                padding:      '24px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  {/* Safepay shield */}
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '9px',
                    background: '#F6F4EF', border: '1px solid #E0DDD6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M9 1.5L3 4v5c0 3.6 2.7 7 6 7.5C12.3 16 15 12.6 15 9V4L9 1.5z"
                        fill="#4C3FD4" opacity="0.15" stroke="#4C3FD4" strokeWidth="1.2" />
                      <path d="M6.5 9.5l2 2 3-4" stroke="#4C3FD4" strokeWidth="1.2"
                        strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0E0E0D' }}>
                      Secured by Safepay
                    </div>
                    <div style={{ fontSize: '12px', color: '#9C9890' }}>
                      Pakistan's regulated payments provider
                    </div>
                  </div>
                </div>
                {[
                  'PCI-DSS compliant payment processing',
                  'Your card data never touches Kobin AI servers',
                  'Encrypted SSL checkout',
                  'Cancel anytime from your dashboard',
                ].map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#0D6B4F', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', color: '#7A776F' }}>{t}</span>
                  </div>
                ))}
              </div>

              {/* Savings calculator */}
              <div style={{
                background:   '#0E0E0D',
                border:       '1px solid #2A2A28',
                borderRadius: '16px',
                padding:      '24px',
                color:        '#F0EDE6',
              }}>
                <div style={{ fontSize: '12px', color: '#555552', fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>
                  What you replace
                </div>
                {[
                  { tool: 'Slack',   price: '$15/user/mo' },
                  { tool: 'Notion',  price: '$16/mo'      },
                  { tool: 'HubSpot', price: '$90/mo'      },
                  { tool: 'Linear',  price: '$8/user/mo'  },
                  { tool: 'Buffer',  price: '$18/mo'      },
                ].map(({ tool, price }) => (
                  <div key={tool} style={{
                    display:         'flex',
                    justifyContent:  'space-between',
                    alignItems:      'center',
                    borderBottom:    '1px solid #1A1A18',
                    padding:         '8px 0',
                    fontSize:        '13px',
                  }}>
                    <span style={{ color: '#555552' }}><s>{tool}</s></span>
                    <span style={{ color: '#3A3A38' }}>{price}</span>
                  </div>
                ))}
                <div style={{
                  display:        'flex',
                  justifyContent: 'space-between',
                  marginTop:      '12px',
                  fontSize:       '15px',
                  fontWeight:     600,
                }}>
                  <span style={{ color: '#F0EDE6' }}>You save</span>
                  <span style={{ color: '#3DB88A' }}>~$220/mo</span>
                </div>
              </div>

              {/* FAQ */}
              <div style={{
                background:   '#fff',
                border:       '1px solid #E0DDD6',
                borderRadius: '16px',
                padding:      '24px',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E0E0D', marginBottom: '14px' }}>
                  Common questions
                </div>
                {[
                  {
                    q: 'Can I cancel anytime?',
                    a: 'Yes. Cancel from your dashboard and you keep access until the end of your billing period. No lock-in.',
                  },
                  {
                    q: 'Is my card stored by Kobin AI?',
                    a: 'No. Payments are handled entirely by Safepay. Kobin AI never sees your card details.',
                  },
                  {
                    q: 'What happens after the trial?',
                    a: 'After 14 days you\'ll be charged your selected plan amount. You can downgrade to Free any time before that.',
                  },
                ].map(({ q, a }) => (
                  <details key={q} style={{ borderBottom: '1px solid #F0EDE6', paddingBottom: '4px' }}>
                    <summary style={{
                      fontSize:  '13px',
                      fontWeight: 500,
                      cursor:    'pointer',
                      color:     '#0E0E0D',
                      padding:   '10px 0',
                      listStyle: 'none',
                      display:   'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      {q}
                      <span style={{ color: '#9C9890', fontWeight: 300 }}>+</span>
                    </summary>
                    <p style={{ fontSize: '12px', color: '#7A776F', lineHeight: 1.6, paddingBottom: '10px', margin: 0 }}>
                      {a}
                    </p>
                  </details>
                ))}
              </div>

              {/* Back link */}
              <Link
                href="/"
                style={{
                  fontSize:       '13px',
                  color:          '#9C9890',
                  textDecoration: 'none',
                  fontFamily:     "'Geist Mono', monospace",
                  textAlign:      'center',
                  display:        'block',
                  padding:        '8px',
                }}
              >
                ← Back to home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// Wrap in Suspense for useSearchParams
export default function UpgradePage() {
  return (
    <Suspense fallback={<div style={{ paddingTop: '100px', textAlign: 'center', fontFamily: 'Geist, sans-serif', color: '#9C9890' }}>Loading…</div>}>
      <UpgradeContent />
    </Suspense>
  )
}