import { db, requireMethod, requireAdmin, getOrder, HttpError } from '../_lib/core.js'
import { easypost } from '../_lib/easypost.js'

// Buys the selected rate and stores tracking + label on the order.
// Marking the order shipped / emailing the customer is a separate step (mark-shipped).
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const { orderId, shipment_id, rate_id } = req.body || {}
  if (!shipment_id || !rate_id) throw new HttpError(400, 'shipment_id and rate_id are required')
  const order = await getOrder(orderId)

  const data = await easypost(`/shipments/${encodeURIComponent(shipment_id)}/buy`, { rate: { id: rate_id } })
  const result = {
    tracking_number: data.tracking_code,
    carrier: data.selected_rate?.carrier,
    service: data.selected_rate?.service,
    rate: data.selected_rate?.rate,
    label_url: data.postage_label?.label_url,
  }

  const { error } = await db().from('orders').update({
    tracking_number: result.tracking_number,
    shipping_carrier: [result.carrier, result.service].filter(Boolean).join(' '),
    shipping_label_url: result.label_url,
  }).eq('id', order.id)
  if (error) throw new HttpError(500, error.message)

  return res.status(200).json(result)
}
