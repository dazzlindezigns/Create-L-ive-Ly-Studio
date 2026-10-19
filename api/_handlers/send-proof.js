import { db, requireMethod, requireAdmin, getOrder, HttpError, firstName, APP_URL, BRAND } from '../_lib/core.js'
import { layout, panel, button, sendEmail, esc, escBr } from '../_lib/email.js'
import { COLORS } from '../../src/brand.js'

// Emails the proof(s) saved on the order and opens the order for customer review.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const order = await getOrder(req.body?.orderId)
  const items = order.proof_items?.length ? order.proof_items : (order.proof_urls || []).map(url => ({ url, label: null }))
  if (!items.length) throw new HttpError(400, 'Upload at least one proof first')

  const imagesHtml = items.map(item => {
    const label = item.label ? `<p style="font-size:11px;font-weight:700;color:${COLORS.primary};text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">${esc(item.label)}</p>` : ''
    if (/\.pdf($|\?)/i.test(item.url)) {
      return `<div style="margin-bottom:18px;">${label}<a href="${esc(item.url)}" style="color:${COLORS.secondary};font-weight:700;">Open PDF proof ↗</a></div>`
    }
    return `<div style="margin-bottom:18px;">${label}<img src="${esc(item.url)}" alt="${esc(item.label || 'Proof')}" style="max-width:100%;border-radius:10px;border:1px solid #eee;display:block;" /></div>`
  }).join('')

  await sendEmail({
    to: order.customer_email,
    subject: `Your proof is ready for review, ${firstName(order.customer_name)}!`,
    html: layout({
      heading: 'Your proof is ready!',
      body: `<p style="margin:0 0 18px;">Hey ${esc(firstName(order.customer_name))}! Take a look at your proof${items.length > 1 ? 's' : ''} and let us know if everything looks good or if you'd like changes.</p>
        ${order.proof_note ? panel(`Note from ${BRAND.ownerFirstName}`, `<p style="margin:0;font-size:14px;">${escBr(order.proof_note)}</p>`) : ''}
        ${imagesHtml}
        ${button('Approve or request changes →', `${APP_URL}/proof/${order.id}`, COLORS.secondary)}
        <p style="font-size:13px;color:#999;text-align:center;margin:0;">Production starts once you approve.</p>`,
    }),
  })

  const { error } = await db().from('orders').update({
    proof_status: 'sent',
    proof_sent_at: new Date().toISOString(),
    proof_urls: items.map(i => i.url),
    status: ['cancelled', 'declined', 'completed', 'shipped'].includes(order.status) ? order.status : 'proof_sent',
  }).eq('id', order.id)
  if (error) throw new HttpError(500, error.message)

  return res.status(200).json({ success: true })
}
