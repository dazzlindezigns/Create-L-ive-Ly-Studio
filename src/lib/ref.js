// Remembers which partner link brought a shopper here (?ref=CODE), for REF_DAYS.
// The last partner link they used wins. Checkout sends it with the order.
import { REF_DAYS, cleanCode } from './affiliates.js'

const KEY = 'partner-ref'

export function captureRef() {
  const code = cleanCode(new URLSearchParams(window.location.search).get('ref'))
  if (!code) return
  try { localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() })) } catch { /* private mode */ }
  // Count one visit per browser session.
  try {
    if (sessionStorage.getItem(`${KEY}-${code}`)) return
    sessionStorage.setItem(`${KEY}-${code}`, '1')
  } catch { /* still count */ }
  fetch('/api/track-ref', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }), keepalive: true }).catch(() => {})
}

export function currentRef() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (r?.code && Date.now() - r.at < REF_DAYS * 86400000) return r.code
  } catch { /* ignore */ }
  return null
}

// "Shop for myself" from a partner's page (?partner=<token>): their own-order discount, remembered
// on this device. The server checks the token again at checkout and uses the real discount.
const SELF_KEY = 'partner-self'

export function capturePartnerSelf() {
  const token = new URLSearchParams(window.location.search).get('partner')
  if (!/^[0-9a-f-]{36}$/i.test(token || '')) return
  fetch(`/api/get-partner?token=${encodeURIComponent(token)}`).then(r => r.ok ? r.json() : null).then(p => {
    if (!p?.active || !(p.ownDiscount > 0)) return
    try {
      localStorage.setItem(SELF_KEY, JSON.stringify({ token, pct: p.ownDiscount, name: p.name.split(' ')[0], program: p.program }))
      window.dispatchEvent(new Event('partner-self'))
    } catch { /* private mode */ }
  }).catch(() => {})
}

export function partnerSelf() {
  try { return JSON.parse(localStorage.getItem(SELF_KEY) || 'null') } catch { return null }
}

export function clearPartnerSelf() {
  try { localStorage.removeItem(SELF_KEY); window.dispatchEvent(new Event('partner-self')) } catch { /* ignore */ }
}
