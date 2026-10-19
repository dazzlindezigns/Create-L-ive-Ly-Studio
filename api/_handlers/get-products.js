import { db, requireMethod, HttpError } from '../_lib/core.js'

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
  // eslint-disable-next-line no-unused-vars
  return res.status(200).json((data || []).map(({ digital_file_path, active, created_at, ...p }) => p))
}
