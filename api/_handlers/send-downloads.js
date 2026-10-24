import { requireMethod, requireAdmin, getOrder, HttpError } from '../_lib/core.js'
import { digitalLines, isPaidInFull, sendDownloadEmail } from '../_lib/downloads.js'

// Admin: (re)send the download email, e.g. after recording a cash payment or if the buyer lost it.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const order = await getOrder(req.body?.orderId)
  if (!digitalLines(order).length) throw new HttpError(400, 'This order has no digital products')
  if (order.status === 'refunded') throw new HttpError(400, 'This order was refunded')
  if (!isPaidInFull(order)) throw new HttpError(400, 'Downloads unlock once the order is paid in full')
  await sendDownloadEmail(order)
  return res.status(200).json({ success: true })
}
