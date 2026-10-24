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
