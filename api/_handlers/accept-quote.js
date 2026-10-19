import { db, requireMethod, getOrder, HttpError, firstName, APP_URL, BRAND } from '../_lib/core.js'
import { layout, rows, button, emailMaker, esc } from '../_lib/email.js'
import { notifyAdmins } from '../_lib/push.js'
import { fmt } from '../../src/lib/money.js'

// Customer e-signs the quote agreement on /quote/:id.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  const { orderId, signature, agreed } = req.body || {}
  const order = await getOrder(orderId)

  const sig = String(signature || '').trim()
  if (!agreed || sig.length < 2) throw new HttpError(400, 'Type your full name and accept the terms to sign')
  if (order.price == null) throw new HttpError(400, 'This order has not been quoted yet')
  if (['cancelled', 'declined'].includes(order.status)) throw new HttpError(400, 'This quote is no longer active')
  if (order.terms_agreed_at) return res.status(200).json({ success: true, alreadySigned: true })

  const now = new Date().toISOString()
  const { error } = await db().from('orders').update({
    customer_signature: sig.slice(0, 200),
    terms_agreed_at: now,
  }).eq('id', order.id)
  if (error) throw new HttpError(500, error.message)

  await Promise.all([
    notifyAdmins({
      title: '✍️ Quote signed',
      body: `${firstName(order.customer_name)} signed the quote for ${order.product_type} (${fmt(order.price)})`,
      url: `/dashboard/order/${order.id}`,
    }),
    emailMaker(`${order.customer_name} signed their quote`, layout({
      heading: 'Quote signed',
      body: rows([
        ['Customer', esc(order.customer_name)],
        ['Order', `${esc(order.product_type)} × ${order.quantity}`],
        ['Total', fmt(order.price)],
        ['Signed as', esc(sig)],
        ['Signed at', new Date(now).toLocaleString('en-US', { timeZone: BRAND.timezone })],
      ]) + button('Open order →', `${APP_URL}/dashboard/order/${order.id}`),
    })),
  ])

  return res.status(200).json({ success: true })
}
