import { db, requireMethod, requireAdmin, getOrder, HttpError, firstName, APP_URL, BRAND } from '../_lib/core.js'
import { layout, rows, panel, button, sendEmail, esc } from '../_lib/email.js'
import { createRefund } from '../_lib/stripe.js'
import { fmt, round2, refundable } from '../../src/lib/money.js'

// Admin: refund all or part of what a customer paid. Card payments go back through Stripe;
// anything paid another way (cash, Zelle…) is only recorded — she returns that money herself.
// A full refund closes the order as 'refunded' (which also locks downloads).
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const { orderId, amount, note, notify = true, restock = false } = req.body || {}
  const order = await getOrder(orderId)
  const supabase = db()

  const { data: pays, error } = await supabase.from('payments').select('*').eq('order_id', order.id)
  if (error) throw new HttpError(500, error.message)
  const avail = refundable(pays || [])
  const want = round2(amount)
  if (!(want > 0)) throw new HttpError(400, 'Enter an amount to refund')
  if (!avail.total) throw new HttpError(400, 'There’s nothing left to refund on this order')
  // Also capped by the order's own totals, in case a refund row ever failed to save.
  const max = Math.min(avail.total, round2((Number(order.amount_paid) || 0) - (Number(order.refunded_amount) || 0)))
  if (want > max + 0.009) throw new HttpError(400, max > 0 ? `You can refund up to ${fmt(max)}` : 'There’s nothing left to refund on this order')

  const now = new Date().toISOString()
  let left = want, toCard = 0, other = 0
  try {
    for (const { payment, card, left: room } of avail.list) {
      if (left <= 0) break
      const take = round2(Math.min(room, left))
      const refund = card
        ? await createRefund({ paymentIntentId: payment.stripe_payment_intent_id, sessionId: payment.stripe_session_id, amount: take, orderId: order.id, note })
        : null
      const { error: e } = await supabase.from('payments').insert({
        order_id: order.id, kind: 'refund', amount: take, status: 'refunded', paid_at: now,
        refund_of: payment.id, stripe_refund_id: refund?.id || null,
      })
      if (e) console.error('refund row insert failed', order.id, e.message)
      if (card) toCard = round2(toCard + take); else other = round2(other + take)
      left = round2(left - take)
    }
  } finally {
    // Whatever went through is recorded on the order, even if a later piece failed.
    const done = round2(toCard + other)
    if (done > 0) {
      const total = round2((Number(order.refunded_amount) || 0) + done)
      const full = total >= round2(order.amount_paid) - 0.009
      await supabase.from('orders').update({ refunded_amount: total, refunded_at: now, ...(full ? { status: 'refunded' } : {}) }).eq('id', order.id)
      // Refunded shop items go back on the shelf when she asks (tracked products only).
      if (full && restock && order.source === 'shop') {
        for (const l of (order.shop_cart || []).filter(l => l.kind === 'physical' && l.productId)) {
          const { error: e } = await supabase.rpc('restock_product', { p_id: l.productId, p_qty: l.quantity })
          if (e) console.error('restock failed', l.productId, e.message)
        }
      }
    }
  }

  if (notify && order.customer_email) {
    await sendEmail({
      to: order.customer_email,
      log: { orderId: order.id, kind: 'refund' },
      subject: `Your refund from ${BRAND.name}`,
      html: layout({
        heading: 'Your refund is on its way',
        body: `<p style="margin:0;">Hey ${esc(firstName(order.customer_name))}! We've refunded <strong>${fmt(want)}</strong> for your <strong>${esc(order.product_type)}</strong> order.</p>
          ${panel('Refund', rows([
            ['Refunded', `<strong>${fmt(want)}</strong>`],
            ...(toCard && other ? [['To your card', fmt(toCard)], ['Returned another way', fmt(other)]] : []),
          ]))}
          ${toCard ? '<p style="margin:0 0 14px;font-size:13px;color:#777;">Card refunds usually show up on your statement in 5–10 business days.</p>' : ''}
          ${button('View your order', `${APP_URL}/quote/${order.id}`)}
          <p style="font-size:13px;color:#999;text-align:center;margin:0;">Questions? Just reply to this email. — ${esc(BRAND.ownerFirstName)}</p>`,
      }),
    }).catch(e => console.error('refund email failed', e))
  }

  return res.status(200).json({ success: true, refunded: want, toCard, other })
}
