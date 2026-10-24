import { db, requireMethod, HttpError, isEmail, firstName, APP_URL, BRAND } from '../_lib/core.js'
import { priceCart, takeFromStock } from '../_lib/pricing.js'
import { sendDownloadEmail } from '../_lib/downloads.js'
import { layout, rows, button, sendEmail, emailMaker, esc } from '../_lib/email.js'
import { createCheckoutSession } from '../_lib/stripe.js'
import { notifyAdmins } from '../_lib/push.js'
import { cleanAddress } from '../_lib/validate.js'
import { fmt, round2 } from '../../src/lib/money.js'
import { cleanCode } from '../../src/lib/affiliates.js'
import { tiersFromSettings } from '../../src/lib/cart.js'

export default async function handler(req, res) {
  requireMethod(req, 'POST')
  const b = req.body || {}
  const supabase = db()

  const { data: settingsRows } = await supabase.from('settings').select('key, value')
    .in('key', ['shop_open', 'shop_shipping_fee', 'shop_free_shipping_over', 'stack_save_tiers', 'sticker_bar_tiers'])
  const settings = Object.fromEntries((settingsRows || []).map(r => [r.key, r.value]))
  if (settings.shop_open === false || settings.shop_open === 'false') throw new HttpError(400, 'The shop is closed right now')

  const customerName = String(b.customerName || '').trim()
  const customerEmail = String(b.customerEmail || '').trim().toLowerCase()
  if (!customerName || !isEmail(customerEmail)) throw new HttpError(400, 'Name and a valid email are required')

  const price = (shipping) => priceCart(b.items, b.discountCode, {
    shippingFee: shipping ? Number(settings.shop_shipping_fee) || 0 : 0,
    freeShippingOver: Number(settings.shop_free_shipping_over) || 0,
    stackTiers: tiersFromSettings(settings),
  })
  const wantsShipping = b.fulfillment === 'shipping'
  let cart = await price(wantsShipping)
  const hasPhysical = cart.lines.some(l => l.kind === 'physical')
  // Download-only carts never pay shipping.
  if (!hasPhysical && wantsShipping) cart = await price(false)

  const fulfillment = !hasPhysical ? 'digital' : wantsShipping ? 'shipping' : 'pickup'
  const shippingAddress = fulfillment === 'shipping' ? cleanAddress(b.shippingAddress, customerName) : null
  if (fulfillment === 'shipping' && !shippingAddress) throw new HttpError(400, 'Complete shipping address is required')

  const lines = cart.lines.map(l => `${l.productName}${l.option ? ` (${l.option})` : ''}${l.kind === 'digital' ? ' [digital download]' : ` × ${l.quantity}`} — ${fmt(l.itemTotal)}`)
  if (cart.stackTier) lines.push(`Stack & Save ${cart.stackTier.pct}% off (−${fmt(cart.stackDiscount)})`)
  if (cart.discount) lines.push(`Code ${cart.discount.code} (−${fmt(cart.codeDiscount)})`)
  if (cart.shipping) lines.push(`Shipping ${fmt(cart.shipping)}`)
  if (cart.freeShipping) lines.push('Free shipping')

  // Stripe can't charge under $0.50. A $0 order (e.g. a 100% code) is completed below without Stripe.
  if (cart.total > 0 && cart.total < 0.5) throw new HttpError(400, 'Card payments must be at least $0.50 — add another item or use a different code.')

  const productType = cart.lines.length === 1 ? cart.lines[0].productName : `Shop order (${cart.lines.length} items)`
  // Shop items are made as shown: checkout takes no notes or design files (custom work goes through /custom).

  // Partner link (?ref=CODE, remembered in the browser): 25% (or the partner's rate) of the items after
  // discounts, before shipping. Partners don't earn on their own orders.
  let partner = null
  const refCode = cleanCode(b.ref)
  if (refCode) {
    const { data } = await supabase.from('affiliates').select('id, email, rate').eq('code', refCode).eq('active', true).maybeSingle()
    if (data && String(data.email || '').toLowerCase() !== customerEmail) partner = data
  }

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
    fulfillment,
    shipping_address: shippingAddress,
    status: 'payment_pending',
    source: 'shop',
    payment_methods: ['card'],
    shop_cart: cart.lines,
    shop_discount_code: cart.discount?.code || null,
    shop_discount_amount: cart.codeDiscount || null,
    quote_breakdown: {
      lines: cart.lines.map(l => ({ description: `${l.productName}${l.option ? ` (${l.option})` : ''}${l.kind === 'digital' ? ' — digital download' : ''}`, qty: l.quantity, unitPrice: l.unitPrice })),
    },
    ...(partner ? { affiliate_id: partner.id, commission: round2(cart.merchandise * (Number(partner.rate) || 0) / 100) } : {}),
    customer_signature: customerName,
    terms_agreed_at: new Date().toISOString(),
  }).select().single()
  if (error) throw new HttpError(500, error.message)

  if (cart.total === 0) return res.status(200).json(await completeFreeOrder({ supabase, order, cart, productType, customerName, hasPhysical }))

  const url = await createCheckoutSession({
    orderId: order.id,
    kind: 'full',
    amount: cart.total,
    name: `${BRAND.name} — ${productType}`,
    buyerEmail: customerEmail,
    successUrl: `${APP_URL}/quote/${order.id}?paid=1`,
    // Cancelling Stripe returns to the shared product page when they came from one.
    cancelUrl: `${APP_URL}${/^\/p\/[0-9a-f-]{36}$/i.test(b.returnTo || '') ? b.returnTo : '/shop/products'}`,
  })
  await supabase.from('orders').update({ stripe_payment_url: url }).eq('id', order.id)

  // Count the code use at checkout creation, like the reference app.
  if (cart.discount) {
    try { await supabase.rpc('increment_discount_uses', { code_id: cart.discount.id }) } catch {}
  }

  // No alert yet — she hears about it once it's paid (stripe-webhook.js), so abandoned checkouts don't ping her.
  return res.status(200).json({ orderId: order.id, url })
}

// $0 orders skip Stripe: mark paid, unlock downloads, take stock, and tell everyone.
async function completeFreeOrder({ supabase, order, cart, productType, customerName, hasPhysical }) {
  const now = new Date().toISOString()
  const paid = { status: hasPhysical ? 'confirmed' : 'completed', balance_paid: true, deposit_paid: true, deposit_paid_at: now, paid_at: now, amount_paid: 0 }
  const { error } = await supabase.from('orders').update(paid).eq('id', order.id)
  if (error) throw new HttpError(500, error.message)
  const done = { ...order, ...paid }

  if (cart.discount) {
    try { await supabase.rpc('increment_discount_uses', { code_id: cart.discount.id }) } catch {}
  }
  await takeFromStock(done)

  const hasDigital = cart.lines.some(l => l.kind === 'digital')
  await Promise.all([
    hasDigital ? sendDownloadEmail(done).catch(e => console.error('download email failed', e)) : null,
    hasPhysical ? sendEmail({
      to: done.customer_email,
      log: { orderId: done.id, kind: 'receipt' },
      subject: `Your order is confirmed, ${firstName(customerName)}!`,
      html: layout({
        heading: 'Order confirmed!',
        body: `<p style="margin:0;">Thank you! Your <strong>${esc(productType)}</strong> order is confirmed${cart.discount ? ` with code ${esc(cart.discount.code)}` : ''} — nothing to pay. We'll let you know when it's ready.</p>
          ${button('View your order', `${APP_URL}/quote/${done.id}`)}`,
      }),
    }).catch(e => console.error('confirmation email failed', e)) : null,
    emailMaker(`🎁 Free shop order — ${customerName}`, layout({
      heading: 'Free shop order',
      body: rows([['Customer', esc(customerName)], ['Order', esc(productType)], ['Code', esc(cart.discount?.code || '—')], ['Total', fmt(0)]])
        + button('Open order →', `${APP_URL}/dashboard/order/${done.id}`),
    })).catch(e => console.error('maker email failed', e)),
    notifyAdmins({ title: '🎁 Free shop order', body: `${firstName(customerName)} got ${productType}${cart.discount ? ` with ${cart.discount.code}` : ''}`, url: `/dashboard/order/${done.id}` }),
  ])
  return { orderId: done.id, url: `${APP_URL}/quote/${done.id}?paid=1` }
}
