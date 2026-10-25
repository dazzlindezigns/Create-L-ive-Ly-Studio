import { requireMethod } from '../_lib/core.js'
import { FINDS } from '../../src/brand.js'

// Can her Linktree be shown inside the Finds page? Linktree decides with its X-Frame-Options /
// CSP frame-ancestors headers; when it says no, the page shows a styled "open my list" button instead.
export default async function handler(req, res) {
  requireMethod(req, 'GET')
  const user = String(FINDS.linktree || '').trim()
  if (!user) return res.status(200).json({ url: null, embeddable: false })
  const url = `https://linktr.ee/${encodeURIComponent(user)}`
  let embeddable = false
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StudioApp/1.0)' } })
    const xfo = (r.headers.get('x-frame-options') || '').toLowerCase()
    const ancestors = (r.headers.get('content-security-policy') || '').toLowerCase().match(/frame-ancestors([^;]*)/)?.[1].trim()
    embeddable = r.ok && !xfo && (!ancestors || ancestors.split(/\s+/).includes('*'))
  } catch { embeddable = false }
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).json({ url, embeddable })
}
