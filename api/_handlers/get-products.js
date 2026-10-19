import { db, requireMethod, HttpError } from '../_lib/core.js'

export default async function handler(req, res) {
  requireMethod(req, 'GET')
  const supabase = db()
  let query = supabase
    .from('products')
    .select('id, name, description, price, image_urls, options, bulk_pricing_enabled, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (req.query.id) query = query.eq('id', req.query.id)

  const { data, error } = await query
  if (error) throw new HttpError(500, error.message)
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300')
  return res.status(200).json(data || [])
}
