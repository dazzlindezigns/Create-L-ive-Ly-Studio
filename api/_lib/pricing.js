import { db, HttpError } from './core.js'
import { cartTotals, discountAmount, lineFormat, unitPrice, offersDigital } from '../../src/lib/cart.js'
import { round2 } from '../../src/lib/money.js'

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

// Server-side cart pricing. `items` = [{ productId, option, quantity, format: 'digital'|'physical' }].
// Prices always come from the products table, never from the client.
// opts: { shippingFee, freeShippingOver, stackTiers } from the settings table.
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
    // One copy of a digital file per order — the download link covers it.
    if (digital) {
      if (seenDigital.has(p.id)) continue
      seenDigital.add(p.id)
      if (!p.digital_file_path) throw new HttpError(400, `${p.name} isn't available for download yet`)
    }
    const quantity = digital ? 1 : Math.max(1, Math.min(10000, parseInt(i.quantity, 10) || 1))
    const option = !digital && p.options?.length ? (p.options.includes(i.option) ? i.option : p.options[0]) : null
    const price = unitPrice(p, format)
    lines.push({
      productId: p.id,
      productName: p.name,
      kind: digital ? 'digital' : 'physical',
      ...(digital ? { digitalFilePath: p.digital_file_path, digitalFileName: p.digital_file_name } : {}),
      option,
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
  if (code) {
    const found = await findDiscount(code)
    if (found.error) throw new HttpError(400, found.error)
    discount = found.row
  }

  const totals = cartTotals(lines, {
    stackTiers: opts.stackTiers,
    code: discount,
    shippingFee: opts.shippingFee || 0,
    freeShippingOver: opts.freeShippingOver || 0,
  })
  return { lines, discount, ...totals }
}

// Takes paid shop items out of stock (physical lines only; untracked products are skipped by the RPC).
export async function takeFromStock(order) {
  for (const l of (order.shop_cart || []).filter(l => l.kind === 'physical' && l.productId)) {
    const { error } = await db().rpc('decrement_product_stock', { p_id: l.productId, p_qty: l.quantity })
    if (error) console.error('stock update failed', l.productId, error.message)
  }
}
