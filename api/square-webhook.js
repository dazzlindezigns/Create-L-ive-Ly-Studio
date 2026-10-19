// Square webhook → marks payments paid and moves the order forward.
// Subscribe to `payment.created` and `payment.updated` in the Square Developer Dashboard,
// pointing at https://<your-domain>/api/square-webhook.
import { db, APP_URL, firstName } from './_lib/core.js'
import { verifySquareSignature } from './_lib/square.js'
import { notifyAdmins } from './_lib/push.js'
import { layout, rows, panel, button, emailMaker, sendEmail, esc } from './_lib/email.js'
import { digitalLines, hasPhysicalLines, sendDownloadEmail } from './_lib/downloads.js'
import { fmt, round2 } from '../src/lib/money.js'

export const config = { api: { bodyParser: false } }

async function rawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const PRE_PAYMENT = ['pending', 'quote_sent', 'invoice_sent', 'payment_pending']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const body = await rawBody(req)
  const notificationUrl = process.env.SQUARE_WEBHOOK_URL || `${APP_URL}/api/square-webhook`
  try {
    if (!verifySquareSignature(body, req.headers['x-square-hmacsha256-signature'], notificationUrl)) {
      return res.status(401).json({ error: 'Invalid signature' })
    }
  } catch (e) {
    console.error('square-webhook:', e.message)
    return res.status(500).json({ error: 'Webhook not configured' })
  }

  let event
  try { event = JSON.parse(body) } catch { return res.status(400).json({ error: 'Invalid JSON' }) }

  const payment = event?.data?.object?.payment
  if (!['payment.created', 'payment.updated'].includes(event?.type) || payment?.status !== 'COMPLETED' || !payment.order_id) {
    return res.status(200).json({ ok: true, ignored: true })
  }

  try {
    await handleCompleted(payment)
  } catch (e) {
    console.error('square-webhook handler error:', e)
    return res.status(500).json({ error: 'Handler failed' }) // Square retries on non-2xx
  }
  return res.status(200).json({ ok: true })
}

async function handleCompleted(payment) {
  const supabase = db()

  // Claim the pending payment row atomically so duplicate webhooks don't double-count.
  const now = new Date().toISOString()
  const { data: claimed } = await supabase
    .from('payments')
    .update({ status: 'paid', paid_at: now, square_payment_id: payment.id })
    .eq('square_order_id', payment.order_id)
    .eq('status', 'pending')
    .select()
  const row = claimed?.[0]
  if (!row) return // unknown checkout, or already processed

  const { data: order } = await supabase.from('orders').select('*').eq('id', row.order_id).single()
  if (!order) return

  const amount = payment.amount_money?.amount != null ? round2(payment.amount_money.amount / 100) : round2(row.amount)
  const amountPaid = round2((Number(order.amount_paid) || 0) + amount)
  const fullyPaid = amountPaid >= round2(order.price) - 0.009

  // Any completed payment satisfies the deposit requirement.
  const updates = { amount_paid: amountPaid, stripe_payment_url: null, deposit_paid: true, deposit_paid_at: order.deposit_paid_at || now }
  if (fullyPaid) { updates.balance_paid = true; updates.paid_at = now }
  const isDigital = digitalLines(order).length > 0
  // Download-only orders are done the moment they're paid; anything physical still needs making.
  if (PRE_PAYMENT.includes(order.status)) updates.status = fullyPaid && isDigital && !hasPhysicalLines(order) ? 'completed' : 'confirmed'
  await supabase.from('orders').update(updates).eq('id', order.id)

  const label = { deposit: 'Deposit', balance: 'Balance', full: 'Payment' }[row.kind] || 'Payment'
  const remaining = Math.max(0, round2(order.price - amountPaid))

  await Promise.all([
    notifyAdmins({
      title: `💸 ${label} received`,
      body: `${firstName(order.customer_name)} paid ${fmt(amount)} for ${order.product_type}${remaining ? ` · ${fmt(remaining)} left` : ' · paid in full'}`,
      url: `/dashboard/order/${order.id}`,
    }),
    emailMaker(`💸 ${label} received — ${order.customer_name} (${fmt(amount)})`, layout({
      heading: `${label} received`,
      body: rows([
        ['Customer', esc(order.customer_name)],
        ['Order', esc(order.product_type)],
        ['Paid now', `<strong>${fmt(amount)}</strong>`],
        ['Remaining', remaining ? fmt(remaining) : 'Paid in full'],
      ]) + button('Open order →', `${APP_URL}/dashboard/order/${order.id}`),
    })),
    sendEmail({
      to: order.customer_email,
      subject: `Payment received — thank you, ${firstName(order.customer_name)}!`,
      html: layout({
        heading: 'Payment received!',
        body: `<p style="margin:0;">Thank you! We received your ${label.toLowerCase()} for <strong>${esc(order.product_type)}</strong>.</p>
          ${panel('Receipt', rows([
            ['Paid', fmt(amount)],
            ['Order total', fmt(order.price)],
            ['Remaining', remaining ? fmt(remaining) : 'Paid in full 🎉'],
          ]))}
          ${payment.receipt_url ? button('View Square receipt', payment.receipt_url) : ''}
          ${button('View your order', `${APP_URL}/quote/${order.id}`)}`,
      }),
    }).catch(e => console.error('receipt email failed', e)),
    fullyPaid && isDigital
      ? sendDownloadEmail({ ...order, ...updates }).catch(e => console.error('download email failed', e))
      : null,
  ])
}
