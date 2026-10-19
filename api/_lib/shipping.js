// Carrier tracking links for the "your order shipped" email.
export function trackingUrl(carrier, code) {
  const c = String(carrier || '').toLowerCase()
  const t = encodeURIComponent(code || '')
  if (c.includes('usps')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${t}`
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${t}`
  if (c.includes('dhl')) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${t}`
  return `https://www.google.com/search?q=${t}`
}
