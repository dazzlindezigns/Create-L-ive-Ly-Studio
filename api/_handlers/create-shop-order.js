import { db, requireMethod, HttpError, isEmail, firstName, APP_URL, BRAND } from '../_lib/core.js'
import { priceCart } from '../_lib/pricing.js'
import { createCheckoutSession } from '../_lib/stripe.js'
import { notifyAdmins } from '../_lib/push.js'
import { storageUrlsOnly, cleanAddress } from '../_lib/validate.js'
import { fmt } from '../../src/lib/money.js'

export default async function handler(req, res) {
  requireMethod(req, 'POST')
  const b = req.body || {}
  const supabase = db()

  const { data: settingsRows } = await supabase.from('settings').select('key, value').in('key', ['shop_open', 'shop_shipping_fee'])
  const settings = Object.fromEntries((settingsRows || []).map(r => [r.key, r.value]))
  if (settings.shop_open === false || settings.shop_open === 'false') throw new HttpError(400, 'The shop is closed right now')

  const customerName = String(b.customerName || '').trim()
  const customerEmail = String(b.customerEmail || '').trim().toLowerCase()
  if (!customerName || !isEmail(customerEmail)) throw new HttpError(400, 'Name and a valid email are required')

  // Price once to learn whether anything physical is in the cart, then again with shipping if needed.
  let cart = await priceCart(b.items, b.discountCode, 0)
  const hasPhysical = cart.lines.some(l => l.kind === 'physical')

  const fulfillment = !hasPhysical ? 'digital' : b.fulfillment === 'shipping' ? 'shipping' : 'pickup'
  const shippingAddress = fulfillment === 'shipping' ? cleanAddress(b.shippingAddress, customerName) : null
  if (fulfillment === 'shipping' && !shippingAddress) throw new HttpError(400, 'Complete shipping address is required')

  const shippingFee = fulfillment === 'shipping' ? Number(settings.shop_shipping_fee) || 0 : 0
  if (shippingFee) cart = await priceCart(b.items, b.discountCode, shippingFee)

  const lines = cart.lines.map(l => `${l.productName}${l.option ? ` (${l.option})` : ''}${l.kind === 'digital' ? ' [digital download]' : ` × ${l.quantity}`} — ${fmt(l.itemTotal)}`)
  if (cart.tier) lines.push(`Bulk discount ${cart.tier.badge} (−${fmt(cart.bulkDiscount)})`)
  if (cart.discount) lines.push(`Code ${cart.discount.code} (−${fmt(cart.codeDiscount)})`)
  if (cart.shipping) lines.push(`Shipping ${fmt(cart.shipping)}`)

  const productType = cart.lines.length === 1 ? cart.lines[0].productName : `Shop order (${cart.lines.length} items)`
  const notes = String(b.notes || '').trim().slice(0, 2000)

  const { data: order, error } = await supabase.from('orders').insert({
    product_type: productType,
    description: lines.join('\n'),
    quantity: cart.lines.reduce((s, l) => s + l.quantity, 0),
    price: cart.total,
    deposit_type: 'full',
    deposit_amount: cart.total,
    customer_name: customerName.slice(0, 200),
    customer_email: customerEmail,
    customer_phone: String(b.customerPhone || '').trim().slice(0, 40) || null,
    notes: notes || null,
    fulfillment,
    shipping_address: shippingAddress,
    status: 'payment_pending',
    source: 'shop',
    payment_methods: ['card'],
    shop_cart: cart.lines,
    shop_discount_code: cart.discount?.code || null,
    shop_discount_amount: cart.codeDiscount || null,
    image_urls: storageUrlsOnly(b.designFiles, 'order-files'),
    quote_breakdown: {
      lines: cart.lines.map(l => ({ description: `${l.productName}${l.option ? ` (${l.option})` : ''}`, qty: l.quantity, unitPrice: l.unitPrice })),
    },
    customer_signature: customerName,
    terms_agreed_at: new Date().toISOString(),
  }).select().single()
  if (error) throw new HttpError(500, error.message)

  const url = await createCheckoutSession({
    orderId: order.id,
    kind: 'full',
    amount: cart.total,
    name: `${BRAND.name} — ${productType}`,
    buyerEmail: customerEmail,
    successUrl: `${APP_URL}/quote/${order.id}?paid=1`,
    cancelUrl: `${APP_URL}/shop/products`,
  })
  await supabase.from('orders').update({ stripe_payment_url: url }).eq('id', order.id)

  // Count the code use at checkout creation, like the reference app.
  if (cart.discount) {
    try { await supabase.rpc('increment_discount_uses', { code_id: cart.discount.id }) } catch {}
  }

  await notifyAdmins({
    title: '🛍 New shop order',
    body: `${firstName(customerName)} checked out ${productType} — ${fmt(cart.total)} (awaiting payment)`,
    url: `/dashboard/order/${order.id}`,
  })

  return res.status(200).json({ orderId: order.id, url })
}
