import { db, requireMethod, getOrder, HttpError } from '../_lib/core.js'
import { digitalLines, isPaidInFull, signedDownloads, LINK_TTL_SECONDS } from '../_lib/downloads.js'

// Customer downloads page (/downloads/:orderId). Links are minted fresh on every visit
// and only once the order is paid in full.
export default async function handler(req, res) {
  requireMethod(req, 'GET')
  const order = await getOrder(req.query.id)
  if (!digitalLines(order).length) throw new HttpError(404, 'This order has no digital downloads')
  if (['cancelled', 'declined', 'refunded'].includes(order.status)) throw new HttpError(403, 'This order is no longer active')

  res.setHeader('Cache-Control', 'no-store')
  if (!isPaidInFull(order)) {
    return res.status(200).json({ paid: false, customerName: order.customer_name, items: digitalLines(order).map(l => ({ name: l.productName, fileName: l.digitalFileName })) })
  }

  const items = await signedDownloads(order)
  await db().from('orders').update({ download_count: (order.download_count || 0) + 1 }).eq('id', order.id)
  return res.status(200).json({ paid: true, customerName: order.customer_name, expiresInHours: LINK_TTL_SECONDS / 3600, items })
}
