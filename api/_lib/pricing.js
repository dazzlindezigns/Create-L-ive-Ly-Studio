import { db, HttpError } from './core.js'
import { getBulkTier } from '../../src/brand.js'
import { round2 } from '../../src/lib/money.js'

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

export function discountAmount(row, base) {
  if (!row) return 0
  const v = Number(row.discount_value) || 0
  return row.discount_type === 'percent'
    ? round2(base * Math.min(v, 100) / 100)
    : round2(Math.min(v, base))
}

// Server-side cart pricing. `items` = [{ productId, option, quantity }].
// Prices always come from the products table, never from the client.
export async function priceCart(items, code, shippingFee = 0) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'Your cart is empty')
  const ids = [...new Set(items.map(i => i.productId))]
  const { data: products, error } = await db().from('products').select('*').in('id', ids).eq('active', true)
  if (error) throw new HttpError(500, error.message)

  const seenDigital = new Set()
  const lines = items.filter(i => {
    const p = products.find(x => x.id === i.productId)
    if (p?.kind !== 'digital') return true
    if (seenDigital.has(p.id)) return false
    seenDigital.add(p.id)
    return true
  }).map(i => {
    const p = products.find(x => x.id === i.productId)
    if (!p) throw new HttpError(400, 'A product in your cart is no longer available')
    const digital = p.kind === 'digital'
    if (digital && !p.digital_file_path) throw new HttpError(400, `${p.name} isn't available for download yet`)
    // One copy of a digital file per order — the download link covers it.
    const quantity = digital ? 1 : Math.max(1, Math.min(10000, parseInt(i.quantity, 10) || 1))
    const option = !digital && p.options?.length ? (p.options.includes(i.option) ? i.option : p.options[0]) : null
    return {
      productId: p.id,
      productName: p.name,
      kind: digital ? 'digital' : 'physical',
      ...(digital ? { digitalFilePath: p.digital_file_path, digitalFileName: p.digital_file_name } : {}),
      option,
      quantity,
      unitPrice: round2(p.price),
      itemTotal: round2(p.price * quantity),
      bulkEligible: p.bulk_pricing_enabled !== false,
    }
  })

  const subtotal = round2(lines.reduce((s, l) => s + l.itemTotal, 0))
  const bulkQty = lines.filter(l => l.bulkEligible).reduce((s, l) => s + l.quantity, 0)
  const bulkBase = lines.filter(l => l.bulkEligible).reduce((s, l) => s + l.itemTotal, 0)
  const tier = getBulkTier(bulkQty)
  const bulkDiscount = tier ? round2(bulkBase * tier.pct / 100) : 0

  let discount = null
  let codeDiscount = 0
  if (code) {
    const found = await findDiscount(code)
    if (found.error) throw new HttpError(400, found.error)
    discount = found.row
    codeDiscount = discountAmount(discount, subtotal - bulkDiscount)
  }

  const shipping = round2(shippingFee)
  const total = Math.max(0, round2(subtotal - bulkDiscount - codeDiscount + shipping))
  return { lines, subtotal, tier, bulkDiscount, discount, codeDiscount, shipping, total }
}
