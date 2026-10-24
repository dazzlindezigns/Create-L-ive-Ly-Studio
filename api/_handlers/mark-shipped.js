import { db, requireMethod, requireAdmin, getOrder, HttpError, firstName, APP_URL } from '../_lib/core.js'
import { layout, rows, panel, button, sendEmail, esc } from '../_lib/email.js'
import { trackingUrl } from '../_lib/shipping.js'

export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const { orderId, trackingNumber, carrier, notify = true } = req.body || {}
  const order = await getOrder(orderId)
  const tracking = String(trackingNumber || order.tracking_number || '').trim()
  const carrierName = String(carrier || order.shipping_carrier || '').trim()
  // Tracking is optional — stamped envelopes and hand deliveries don't have one.

  const { error } = await db().from('orders').update({
    tracking_number: tracking || null,
    shipping_carrier: carrierName || null,
    shipped_at: new Date().toISOString(),
    status: 'shipped',
  }).eq('id', order.id)
  if (error) throw new HttpError(500, error.message)

  if (notify) {
    const url = tracking ? trackingUrl(carrierName, tracking) : null
    await sendEmail({
      to: order.customer_email,
      log: { orderId: order.id, kind: 'shipped' },
      subject: `Your order is on the way, ${firstName(order.customer_name)}! 📦`,
      html: layout({
        heading: 'Your order shipped!',
        body: `<p style="margin:0;">Hey ${esc(firstName(order.customer_name))}! Your ${esc(order.product_type)} order is packed up and on its way.</p>
          ${tracking
            ? `${panel('Tracking', rows([['Carrier', esc(carrierName)], ['Tracking #', `<strong>${esc(tracking)}</strong>`]]))}${button('Track your package →', url)}`
            : `${carrierName ? `<p style="margin:14px 0 0;">It's coming by <strong>${esc(carrierName)}</strong>.</p>` : ''}${button('View your order', `${APP_URL}/quote/${order.id}`)}`}`,
      }),
    })
  }

  return res.status(200).json({ success: true })
}
