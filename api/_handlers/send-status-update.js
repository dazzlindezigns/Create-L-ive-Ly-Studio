import { requireMethod, requireAdmin, getOrder, HttpError, firstName, APP_URL, BRAND } from '../_lib/core.js'
import { layout, panel, rows, button, sendEmail, esc } from '../_lib/email.js'
import { fmt, paymentOptions } from '../../src/lib/money.js'

// Stage emails she sends from the order page (status change → "Email the customer?"),
// plus a payment reminder and a receipt re-send. Quote, proof, shipped, receipt and download emails have their own handlers.
const STAGES = {
  in_production: (o) => ({
    subject: `We're making your ${o.product_type}! ✂️`,
    heading: 'Your order is in production',
    body: `${o.proof_status === 'approved' ? 'Your proof is approved and your' : 'Your'} <strong>${esc(o.product_type)}</strong> is now being made with care. We'll let you know the moment it's ready.`,
  }),
  ready_for_pickup: (o) => ({
    subject: `Your order is ready for pickup, ${firstName(o.customer_name)}! 🎉`,
    heading: 'Ready for pickup!',
    body: `Great news — your <strong>${esc(o.product_type)}</strong> is ready. Reply to this email with a day and time that works for you and we'll have it waiting.`,
    extra: panel('Pickup', rows([['Where', esc(BRAND.pickupLabel)]])),
  }),
  completed: (o) => ({
    subject: `Thank you, ${firstName(o.customer_name)}! 💕`,
    heading: 'Thank you for your order',
    body: `Thank you so much for trusting ${esc(BRAND.name)} with your <strong>${esc(o.product_type)}</strong>. We hope it brings a smile every time you see it. If you love it, we'd be so grateful if you shared a photo and tagged us!`,
  }),
  declined: (o) => ({
    subject: `About your order request, ${firstName(o.customer_name)}`,
    heading: 'About your request',
    body: `Thank you so much for thinking of ${esc(BRAND.name)} for your <strong>${esc(o.product_type)}</strong>. Unfortunately we aren't able to take this one on right now. We truly appreciate you, and we'd love to help with a future project.`,
  }),
  // She can re-send a receipt any time a customer asks for it (the page has a PDF download).
  receipt: (o) => {
    const { paid, remaining } = paymentOptions(o)
    if (!(paid > 0) && !o.balance_paid) throw new HttpError(400, 'No payment on this order yet')
    return {
      subject: `Your receipt from ${BRAND.name}`,
      heading: 'Your receipt',
      body: `Here's your receipt for <strong>${esc(o.product_type)}</strong>. Tap below to view it or download a PDF copy.`,
      extra: panel('Receipt', rows([
        ['Paid', fmt(paid)],
        ['Order total', fmt(o.price)],
        ['Remaining', remaining > 0 ? fmt(remaining) : 'Paid in full'],
      ])),
      cta: ['View / download receipt →', `${APP_URL}/quote/${o.id}`],
    }
  },
  payment_reminder: (o) => {
    const { remaining } = paymentOptions(o)
    if (!(remaining > 0)) throw new HttpError(400, 'Nothing is owed on this order')
    return {
      subject: `Friendly reminder: your ${o.product_type} order`,
      heading: 'A quick payment reminder',
      body: `Just a friendly reminder that your <strong>${esc(o.product_type)}</strong> order has a balance of <strong>${fmt(remaining)}</strong>. Tap below to review and pay securely whenever you're ready.`,
      cta: ['Review & pay →', `${APP_URL}/quote/${o.id}`],
    }
  },
}

export const STAGE_KEYS = Object.keys(STAGES)

export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const { orderId, stage } = req.body || {}
  if (!STAGES[stage]) throw new HttpError(400, 'No email for that stage')
  const order = await getOrder(orderId)
  const e = STAGES[stage](order)

  await sendEmail({
    to: order.customer_email,
    log: { orderId: order.id, kind: stage },
    subject: e.subject,
    html: layout({
      heading: e.heading,
      body: `<p style="margin:0 0 14px;">Hey ${esc(firstName(order.customer_name))}! ${e.body}</p>
        ${e.extra || ''}
        ${button(...(e.cta || ['View your order', `${APP_URL}/quote/${order.id}`]))}
        <p style="font-size:13px;color:#999;text-align:center;margin:0;">Questions? Just reply to this email. — ${esc(BRAND.ownerFirstName)}</p>`,
    }),
  })
  return res.status(200).json({ success: true })
}
