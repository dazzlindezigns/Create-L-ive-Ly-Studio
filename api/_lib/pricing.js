import { db, HttpError } from './core.js'
import { cartTotals, discountAmount, lineFormat, unitPrice, offersDigital, resolveOptions, asksUse } from '../../src/lib/cart.js'
import { round2, fmt } from '../../src/lib/money.js'

export { discountAmount }

// Looks up an active discount code. Returns { row } or { error }.
export async function findDiscount(code) {
  const clean = String(code || '').trim()
  if (!clean) return { error: 'No code provided' }
  const { data } = await db().from('discount_codes').select('*').ilike('code', clean).eq('active', true).maybeSingle()
  if (!data) return { error: 'Code not found or inactive' }
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { error: 'This code has expired' }
  if (data.max_uses != null && (data.uses || 0) >= data.max_uses) return { error: 'This code has reached its usage limit' }
  return { row: data }
}

// Server-side cart pricing. `items` = [{ productId, selections: { Size: '4 inch' }, quantity, format: 'digital'|'physical', use: 'personal'|'business' }].
// Prices always come from the products table, never from the client.
// opts: { shippingFee, freeShippingOver, stackTiers, license } from the settings table (license = licenseFromSettings()).
export async function priceCart(items, code, opts = {}) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'Your cart is empty')
  const ids = [...new Set(items.map(i => i.productId))]
  const { data: products, error } = await db().from('products').select('*').in('id', ids).eq('active', true)
  if (error) throw new HttpError(500, error.message)

  const seenDigital = new Set()
  const lines = []
  for (const i of items) {
    const p = products.find(x => x.id === i.productId)
    if (!p) throw new HttpError(400, 'A product in your cart is no longer available')
    const format = lineFormat(p, i.format)
    const digital = format === 'digital'
    // Products that ask "personal or small business use?" need an answer.
    const asks = asksUse(p, opts.license)
    const use = asks ? i.use : null
    if (asks && use !== 'personal' && use !== 'business') {
      throw new HttpError(400, `Choose personal or small business use for ${p.name}`)
    }
    // One copy of a digital file per order — the download link covers it.
    if (digital) {
      if (seenDigital.has(p.id)) {
        const kept = lines.find(l => l.productId === p.id && l.kind === 'digital')
        if (kept && use === 'business') kept.use = 'business'
        continue
      }
      seenDigital.add(p.id)
      if (!p.digital_file_path) throw new HttpError(400, `${p.name} isn't available for download yet`)
    }
    const quantity = digital ? 1 : Math.max(1, Math.min(10000, parseInt(i.quantity, 10) || 1))
    // Options (and their price changes) apply to the physical format only. `option` is the old single-choice field.
    const picked = digital ? null : resolveOptions(p, i.selections || (i.option ? { Option: i.option } : {}))
    const option = picked?.text || null
    const price = round2(unitPrice(p, format) + (picked?.extra || 0))
    lines.push({
      productId: p.id,
      productName: p.name,
      kind: digital ? 'digital' : 'physical',
      ...(digital ? { digitalFilePath: p.digital_file_path, digitalFileName: p.digital_file_name } : {}),
      option,
      selections: picked?.selections || null,
      ...(use ? { use } : {}),
      quantity,
      unitPrice: price,
      itemTotal: round2(price * quantity),
      bulkEligible: p.bulk_pricing_enabled !== false,
    })
  }

  // Stock covers physical units only (all options of a product share one count).
  for (const p of products) {
    if (p.stock == null) continue
    const wanted = lines.filter(l => l.productId === p.id && l.kind === 'physical').reduce((s, l) => s + l.quantity, 0)
    if (wanted > p.stock) {
      throw new HttpError(400, p.stock > 0 ? `Only ${p.stock} of ${p.name} left — please lower the quantity` : `${p.name} is sold out${offersDigital(p) ? ' (the digital download is still available)' : ''}`)
    }
  }

  let discount = null
  if (code && typeof code === 'object') discount = code // e.g. a partner's own-order discount, already verified
  else if (code) {
    const found = await findDiscount(code)
    if (found.error) throw new HttpError(400, found.error)
    discount = found.row
  }

  const totals = cartTotals(lines.map(l => ({ ...l, business: l.use === 'business' })), {
    stackTiers: opts.stackTiers,
    code: discount,
    shippingFee: opts.shippingFee || 0,
    freeShippingOver: opts.freeShippingOver || 0,
    licensePrice: opts.license?.price || 0,
  })
  if (totals.codeShort) {
    throw new HttpError(400, `Code ${discount.code} needs a ${fmt(totals.codeMin)} order — add ${fmt(totals.codeShort)} more, or remove the code`)
  }
  return { lines, discount, license: totals.licenseFee ? opts.license : null, ...totals }
}

// Takes paid shop items out of stock (physical lines only; untracked products are skipped by the RPC).
export async function takeFromStock(order) {
  for (const l of (order.shop_cart || []).filter(l => l.kind === 'physical' && l.productId)) {
    const { error } = await db().rpc('decrement_product_stock', { p_id: l.productId, p_qty: l.quantity })
    if (error) console.error('stock update failed', l.productId, error.message)
  }
}
