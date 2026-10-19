import { HttpError, BRAND } from './core.js'

export async function easypost(path, body) {
  const key = process.env.EASYPOST_API_KEY
  if (!key) throw new HttpError(500, 'EasyPost is not configured (EASYPOST_API_KEY)')
  const auth = Buffer.from(key + ':').toString('base64')
  const resp = await fetch(`https://api.easypost.com/v2${path}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new HttpError(resp.status >= 500 ? 502 : 400, data.error?.message || 'EasyPost error')
  return data
}

export function fromAddress() {
  return {
    name: BRAND.name,
    street1: process.env.MAKER_STREET || '',
    city: process.env.MAKER_CITY || '',
    state: process.env.MAKER_STATE || '',
    zip: process.env.MAKER_ZIP || '',
    country: 'US',
    phone: process.env.MAKER_PHONE || '',
    email: process.env.MAKER_EMAIL || '',
  }
}

export function trackingUrl(carrier, code) {
  const c = String(carrier || '').toLowerCase()
  const t = encodeURIComponent(code || '')
  if (c.includes('usps')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${t}`
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${t}`
  if (c.includes('dhl')) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${t}`
  return `https://www.google.com/search?q=${t}`
}
