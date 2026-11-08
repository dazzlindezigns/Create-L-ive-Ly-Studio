import { db, requireMethod, HttpError } from '../_lib/core.js'
import { digitalFiles } from '../../src/lib/cart.js'

export default async function handler(req, res) {
  requireMethod(req, 'GET')
  const supabase = db()
  let query = supabase
    .from('products')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (req.query.id) query = query.eq('id', req.query.id)

  const { data, error } = await query
  if (error) throw new HttpError(500, error.message)
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300')
  // select('*') keeps the shop working whether or not the latest migration has run.
  // Strip the private download location (and anything admin-only) before it reaches the browser.
  // Star rating per product from visible reviews (skipped quietly if reviews aren't set up yet).
  const ratings = {}
  const { data: reviews } = await supabase.from('reviews').select('product_id, rating').eq('hidden', false)
  for (const r of reviews || []) (ratings[r.product_id] ||= []).push(r.rating)
  const rating = (id) => ratings[id] ? { avg: Math.round(ratings[id].reduce((s, n) => s + n, 0) / ratings[id].length * 10) / 10, count: ratings[id].length } : null
  // Download files go out as names only (for "3 files · PDF, PNG"); their storage paths never leave the server.
  // eslint-disable-next-line no-unused-vars
  return res.status(200).json((data || []).map(({ digital_file_path, digital_files, active, created_at, ...p }) => ({
    ...p, digital_files: digitalFiles({ digital_files, digital_file_path, digital_file_name: p.digital_file_name }).map(f => ({ name: f.name })), rating: rating(p.id),
  })))
}
