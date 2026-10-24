import crypto from 'crypto'
import { db, HttpError } from './core.js'
import { round2 } from '../../src/lib/money.js'

// Stripe Checkout Sessions: form-encoded POST with the secret key (same pattern as the reference app).
// Docs: https://docs.stripe.com/api/checkout/sessions/create

function stripeKey() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new HttpError(500, 'Stripe is not configured (STRIPE_SECRET_KEY)')
  return key
}

// Creates a hosted Stripe Checkout for `amount` dollars and records it in `payments`
// so the webhook can match the completed session back to the order.
export async function createCheckoutSession({ orderId, kind, amount, name, buyerEmail, successUrl, cancelUrl }) {
  const cents = Math.round(round2(amount) * 100)
  if (cents < 50) throw new HttpError(400, 'Amount must be at least $0.50')

  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(cents),
    'line_items[0][price_data][product_data][name]': String(name).slice(0, 250),
    'line_items[0][quantity]': '1',
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: orderId,
    'metadata[order_id]': orderId,
    'metadata[kind]': kind,
    'payment_intent_data[metadata][order_id]': orderId,
  })
  if (buyerEmail) params.set('customer_email', buyerEmail) // Stripe rejects empty values

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: params.toString(),
  })
  const session = await resp.json().catch(() => ({}))
  if (!resp.ok || !session.url) {
    console.error('Stripe error:', resp.status, JSON.stringify(session))
    throw new HttpError(502, session.error?.message || 'Could not start checkout. Please try again.')
  }

  const { error } = await db().from('payments').insert({
    order_id: orderId,
    kind,
    amount: round2(amount),
    stripe_session_id: session.id,
    url: session.url,
  })
  if (error) throw new HttpError(500, error.message)

  return session.url
}

// Verifies the Stripe-Signature header: "t=<ts>,v1=<hex>[,v1=...]",
// HMAC-SHA256(secret, `${t}.${rawBody}`), rejecting events older than 5 minutes.
export function verifyStripeEvent(rawBody, header, secret = process.env.STRIPE_WEBHOOK_SECRET) {
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not set')
  const parts = String(header || '').split(',').map(p => p.split('='))
  const t = parts.find(([k]) => k === 't')?.[1]
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !sigs.length) return null

  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex'))
  const match = sigs.some(s => {
    const got = Buffer.from(s)
    return got.length === expected.length && crypto.timingSafeEqual(got, expected)
  })
  if (!match || Math.abs(Date.now() / 1000 - Number(t)) > 300) return null
  return JSON.parse(rawBody)
}

// Refunds `amount` dollars of one Checkout payment back to the buyer's card.
// Older payment rows may only have the session id, so look the PaymentIntent up from it.
// Docs: https://docs.stripe.com/api/refunds/create
export async function createRefund({ paymentIntentId, sessionId, amount, orderId, note }) {
  const auth = { Authorization: `Bearer ${stripeKey()}` }
  let intent = paymentIntentId
  if (!intent && sessionId) {
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { headers: auth })
    const s = await r.json().catch(() => ({}))
    intent = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id
  }
  if (!intent) throw new HttpError(400, 'Could not find this card payment in Stripe')

  const params = new URLSearchParams({
    payment_intent: intent,
    amount: String(Math.round(round2(amount) * 100)),
    reason: 'requested_by_customer',
    'metadata[order_id]': orderId,
  })
  if (note) params.set('metadata[note]', String(note).slice(0, 450))
  const resp = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': crypto.randomUUID() },
    body: params.toString(),
  })
  const refund = await resp.json().catch(() => ({}))
  if (!resp.ok || !refund.id) {
    console.error('Stripe refund error:', resp.status, JSON.stringify(refund))
    throw new HttpError(502, `Stripe: ${refund.error?.message || 'the refund did not go through'}`)
  }
  return refund
}
