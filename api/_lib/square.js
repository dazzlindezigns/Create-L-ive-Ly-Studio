import crypto from 'crypto'
import { db, HttpError } from './core.js'
import { round2 } from '../../src/lib/money.js'

// Square Payment Links API (hosted checkout). Square takes JSON with a Bearer access token —
// unlike Stripe Checkout Sessions, there is no form-encoded variant.
// Docs: https://developer.squareup.com/reference/square/checkout-api/create-payment-link
const SQUARE_VERSION = '2025-01-23'

function squareBase() {
  return process.env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'
}

// Creates a hosted Square checkout for `amount` dollars and records it in `payments`
// so the webhook can match the completed payment back to the order.
export async function createPaymentLink({ orderId, kind, amount, name, buyerEmail, redirectUrl }) {
  const token = process.env.SQUARE_SECRET_KEY
  const locationId = process.env.SQUARE_LOCATION_ID
  if (!token || !locationId) throw new HttpError(500, 'Square is not configured')

  const cents = Math.round(round2(amount) * 100)
  if (cents < 100) throw new HttpError(400, 'Amount must be at least $1.00')

  const body = {
    idempotency_key: crypto.randomUUID(),
    quick_pay: {
      name: String(name).slice(0, 255),
      price_money: { amount: cents, currency: 'USD' },
      location_id: locationId,
    },
    checkout_options: { redirect_url: redirectUrl },
    payment_note: `Order ${orderId} (${kind})`,
  }
  if (buyerEmail) body.pre_populated_data = { buyer_email: buyerEmail }

  const resp = await fetch(`${squareBase()}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Square-Version': SQUARE_VERSION,
    },
    body: JSON.stringify(body),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || !data.payment_link?.url) {
    console.error('Square error:', resp.status, JSON.stringify(data))
    throw new HttpError(502, data.errors?.[0]?.detail || 'Could not create a payment link. Please try again.')
  }

  const link = data.payment_link
  const { error } = await db().from('payments').insert({
    order_id: orderId,
    kind,
    amount: round2(amount),
    square_order_id: link.order_id,
    square_link_id: link.id,
    url: link.url,
  })
  if (error) throw new HttpError(500, error.message)

  return link.url
}

// Square signs webhooks with HMAC-SHA256(signatureKey, notificationUrl + rawBody), base64.
export function verifySquareSignature(rawBody, signature, notificationUrl) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  if (!key) throw new Error('SQUARE_WEBHOOK_SIGNATURE_KEY not set')
  const expected = crypto.createHmac('sha256', key).update(notificationUrl + rawBody).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature || '')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
