import { db, requireMethod, getOrder, HttpError, firstName } from '../_lib/core.js'

// The customer's review page (/review/:orderId): their products to rate (shop orders) and the
// private shopping-experience question. Opens once the order is paid; answers can be edited later.
export const canReview = (o) => Number(o.amount_paid) > 0 || Boolean(o.balance_paid)
export const reviewableIds = (o) => [...new Set((Array.isArray(o.shop_cart) ? o.shop_cart : []).map(l => l.productId).filter(Boolean))]
export const displayName = (name) => {
  const [first, ...rest] = String(name || '').trim().split(/\s+/)
  const last = rest.pop()
  return [first, last && `${last[0].toUpperCase()}.`].filter(Boolean).join(' ')
}

export default async function handler(req, res) {
  requireMethod(req, 'GET')
  const order = await getOrder(req.query.id)
  if (!canReview(order)) throw new HttpError(400, 'Reviews open once your order is paid')
  const supabase = db()
  const ids = reviewableIds(order)

  const [{ data: products }, { data: reviews }, { data: feedback }] = await Promise.all([
    ids.length ? supabase.from('products').select('id, name, image_urls').in('id', ids) : { data: [] },
    supabase.from('reviews').select('product_id, rating, body, name').eq('order_id', order.id),
    supabase.from('feedback').select('rating, body').eq('order_id', order.id).maybeSingle(),
  ])
  const byProduct = Object.fromEntries((reviews || []).map(r => [r.product_id, r]))
  const names = Object.fromEntries((order.shop_cart || []).map(l => [l.productId, l.productName]))

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    firstName: firstName(order.customer_name),
    name: reviews?.[0]?.name || displayName(order.customer_name),
    productType: order.product_type,
    products: ids.map(id => {
      const p = (products || []).find(x => x.id === id)
      const r = byProduct[id]
      return { id, name: p?.name || names[id] || 'Product', image: p?.image_urls?.[0] || null, rating: r?.rating || 0, body: r?.body || '' }
    }),
    feedback: feedback ? { rating: feedback.rating || 0, body: feedback.body || '' } : null,
  })
}
