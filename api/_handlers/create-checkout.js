import { requireMethod, getOrder, HttpError, APP_URL, BRAND } from '../_lib/core.js'
import { createCheckoutSession } from '../_lib/stripe.js'
import { paymentOptions } from '../../src/lib/money.js'

// Creates a Stripe Checkout Session for a quoted order.
// The amount is computed on the server from the order — the client only picks the kind.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  const { orderId, kind } = req.body || {}
  const order = await getOrder(orderId)

  if (['cancelled', 'declined'].includes(order.status)) throw new HttpError(400, 'This order is no longer active')
  if (order.source !== 'shop' && !order.terms_agreed_at) throw new HttpError(400, 'Please sign the agreement first')
  if (!(order.payment_methods || ['card']).includes('card')) throw new HttpError(400, 'Card payment is not enabled for this order')

  const { options } = paymentOptions(order)
  const opt = options.find(o => o.kind === kind)
  if (!opt) throw new HttpError(400, options.length ? 'That payment option is not available' : 'This order is already paid')

  const label = { deposit: 'Deposit', balance: 'Balance', full: 'Payment' }[kind]
  const url = await createCheckoutSession({
    orderId: order.id,
    kind,
    amount: opt.amount,
    name: `${BRAND.name} — ${order.product_type} (${label})`,
    buyerEmail: order.customer_email,
    successUrl: `${APP_URL}/quote/${order.id}?paid=1`,
    cancelUrl: `${APP_URL}/quote/${order.id}`,
  })

  return res.status(200).json({ url })
}
