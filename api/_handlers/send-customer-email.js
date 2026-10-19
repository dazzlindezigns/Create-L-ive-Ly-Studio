import { requireMethod, requireAdmin, getOrder, HttpError, APP_URL } from '../_lib/core.js'
import { layout, button, sendEmail, escBr } from '../_lib/email.js'
import { digitalLines } from '../_lib/downloads.js'

// Where the optional button in a hand-written email points.
const LINKS = {
  order: { label: 'View your order →', path: (id) => `/quote/${id}` },
  proof: { label: 'Review your proof →', path: (id) => `/proof/${id}` },
  downloads: { label: 'Get your downloads →', path: (id) => `/downloads/${id}` },
}

// Admin: send a message she wrote in the app, wrapped in the branded email layout.
// Replies go to MAKER_EMAIL (her inbox). Logged to email_log for the order's history.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const b = req.body || {}
  const order = await getOrder(b.orderId)

  const subject = String(b.subject || '').trim().slice(0, 200)
  const message = String(b.message || '').trim().slice(0, 10000)
  if (!subject || !message) throw new HttpError(400, 'Add a subject and a message')
  // Catch unfilled template placeholders before a customer sees "{firstName}".
  if (/\{(firstName|product|orderNumber|owner|business|location)\}/.test(subject + message)) {
    throw new HttpError(400, 'Fill in the {placeholders} before sending')
  }

  const link = LINKS[b.link]
  if (b.link === 'downloads' && !digitalLines(order).length) throw new HttpError(400, 'This order has no downloads')

  await sendEmail({
    to: order.customer_email,
    subject,
    log: { orderId: order.id, kind: 'manual', bodyText: message },
    html: layout({
      heading: subject,
      body: `<div style="font-size:15px;line-height:1.7;">${escBr(message)}</div>${link ? button(link.label, `${APP_URL}${link.path(order.id)}`) : ''}`,
    }),
  })

  return res.status(200).json({ success: true })
}
