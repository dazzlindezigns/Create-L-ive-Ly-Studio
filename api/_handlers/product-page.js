import { db, requireMethod, APP_URL, BRAND } from '../_lib/core.js'
import { esc } from '../_lib/email.js'
import { fmt } from '../../src/lib/money.js'

// /p/:id is rewritten here (vercel.json) so shared product links preview with the product's
// photo, name and price in texts, Instagram and Facebook. It serves the normal app page with
// those tags swapped in; the app then shows the product as usual.
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const absolute = (url) => !url ? `${APP_URL}/og-image.png` : /^https?:\/\//.test(url) ? url : `${APP_URL}${url.startsWith('/') ? '' : '/'}${url}`

function setMeta(html, attr, key, value) {
  const tag = `<meta ${attr}="${key}" content="${esc(value)}" />`
  const re = new RegExp(`<meta\\s+${attr}="${key}"[^>]*>`, 'i')
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`)
}

export default async function handler(req, res) {
  requireMethod(req, 'GET')
  const id = String(req.query.id || '')

  let product = null
  if (ID.test(id)) {
    // A lookup failure just means a generic preview — the page itself must still load.
    try {
      const { data } = await db().from('products').select('id, name, description, price, digital_price, kind, image_urls').eq('id', id).eq('active', true).maybeSingle()
      product = data
    } catch (e) { console.error('product-page lookup failed:', e.message) }
  }

  // The built app shell (static file, so this never loops back here).
  let html
  try {
    const r = await fetch(`${APP_URL}/index.html`)
    html = r.ok ? await r.text() : null
  } catch { html = null }
  if (!html) {
    // Couldn't load the shell — send people to the same product inside the shop instead.
    res.setHeader('Cache-Control', 'no-store')
    return res.redirect(302, `/shop/products${ID.test(id) ? `?p=${id}` : ''}`)
  }

  if (product) {
    const price = product.kind !== 'digital' && product.digital_price != null
      ? `from ${fmt(Math.min(product.price, product.digital_price))}` : fmt(product.price)
    const title = `${product.name} — ${BRAND.name}`
    const description = `${price} · ${String(product.description || BRAND.tagline).replace(/\s+/g, ' ').trim().slice(0, 180)}`
    const image = absolute(product.image_urls?.[0])
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)
    for (const [attr, key, value] of [
      ['name', 'description', description],
      ['property', 'og:title', title],
      ['property', 'og:description', description],
      ['property', 'og:type', 'product'],
      ['property', 'og:url', `${APP_URL}/p/${product.id}`],
      ['property', 'og:image', image],
      ['name', 'twitter:image', image],
    ]) html = setMeta(html, attr, key, value)
    // Product photos aren't the square logo, so drop the logo's fixed size hints.
    html = html.replace(/\s*<meta property="og:image:(width|height)"[^>]*>/gi, '')
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600')
  return res.status(200).send(html)
}
