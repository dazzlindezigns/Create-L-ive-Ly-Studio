import { db, requireMethod, requireAdmin, getOrder, HttpError, firstName, APP_URL } from '../_lib/core.js'
import { layout, rows, panel, button, sendEmail, esc, escBr } from '../_lib/email.js'
import { fmt, depositFor } from '../../src/lib/money.js'

// Emails the customer their quote link. The admin saves price/deposit on the order first
// (OrderDetail or Calculator), so this reads the current values from the database.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const order = await getOrder(req.body?.orderId)
  if (!(Number(order.price) > 0)) throw new HttpError(400, 'Set a price before sending the quote')

  const link = `${APP_URL}/quote/${order.id}`
  const deposit = depositFor(order)
  const isInvoice = order.source === 'invoice'
  const lines = order.quote_breakdown?.lines || []
  const linesHtml = lines.length
    ? panel(isInvoice ? 'Invoice' : 'Quote', rows(lines.map(l => [`${l.qty} ×`, `${esc(l.description)} — ${fmt(l.qty * l.unitPrice)}`])))
    : ''

  await sendEmail({
    to: order.customer_email,
    subject: isInvoice ? `Your invoice is ready, ${firstName(order.customer_name)}` : `Your quote is ready, ${firstName(order.customer_name)}!`,
    html: layout({
      heading: isInvoice ? 'Your invoice' : 'Your quote is ready!',
      body: `<p style="margin:0 0 6px;">Hey ${esc(firstName(order.customer_name))}! ${isInvoice ? 'Here is your invoice' : 'Your custom quote is ready'} for <strong>${esc(order.product_type)}</strong>.</p>
        ${linesHtml}
        ${panel('Summary', rows([
          ['Total', `<strong>${fmt(order.price)}</strong>`],
          ['Due today', order.deposit_type !== 'full' && deposit < Number(order.price) ? `${fmt(deposit)} deposit` : fmt(order.price)],
          ['Turnaround', esc(order.turnaround)],
        ]))}
        ${order.quote_note ? `<p style="margin:0 0 6px;">${escBr(order.quote_note)}</p>` : ''}
        ${button(isInvoice ? 'View & pay invoice →' : 'Review, sign & pay →', link)}
        <p style="font-size:13px;color:#999;text-align:center;margin:0;">Questions? Just reply to this email.</p>`,
    }),
  })

  const now = new Date().toISOString()
  const updates = { quote_sent_at: now }
  if (['pending', 'quote_sent', 'invoice_sent'].includes(order.status)) updates.status = isInvoice ? 'invoice_sent' : 'quote_sent'
  const { error } = await db().from('orders').update(updates).eq('id', order.id)
  if (error) throw new HttpError(500, error.message)

  return res.status(200).json({ success: true, link })
}
