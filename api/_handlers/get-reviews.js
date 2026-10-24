import { db, requireMethod, HttpError } from '../_lib/core.js'

// Public reviews for one product (hidden ones left out). No order or customer details.
export default async function handler(req, res) {
  requireMethod(req, 'GET')
  const id = String(req.query.productId || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'Product not found')
  const { data, error } = await db().from('reviews').select('rating, body, name, created_at')
    .eq('product_id', id).eq('hidden', false).order('created_at', { ascending: false }).limit(50)
  if (error) return res.status(200).json([]) // reviews not set up yet
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600')
  return res.status(200).json(data.map(r => ({ rating: r.rating, body: r.body, name: r.name, date: r.created_at })))
}
