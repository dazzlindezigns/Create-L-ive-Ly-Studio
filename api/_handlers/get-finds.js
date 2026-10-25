import { db, requireMethod } from '../_lib/core.js'
import { cleanAmazonUrl } from '../../src/lib/finds.js'

// Public list for /finds and the homepage teaser. Empty (not an error) until the finds table exists.
export default async function handler(req, res) {
  requireMethod(req, 'GET')
  const supabase = db()
  const { data, error } = await supabase.from('finds').select('*').eq('active', true)
    .order('sort_order', { ascending: true }).order('created_at', { ascending: false })
  if (error) return res.status(200).json([])

  const ids = [...new Set(data.map(f => f.pairs_with).filter(Boolean))]
  const { data: products } = ids.length
    ? await supabase.from('products').select('id, name').in('id', ids).eq('active', true)
    : { data: [] }
  const pName = Object.fromEntries((products || []).map(p => [p.id, p.name]))
  // "Popular" = the three most-tapped picks (once they've had real traffic). Click counts stay private.
  const popular = new Set(data.filter(f => f.clicks >= 10).sort((a, b) => b.clicks - a.clicks).slice(0, 3).map(f => f.id))

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600')
  return res.status(200).json(data.filter(f => cleanAmazonUrl(f.url)).map(f => ({
    id: f.id, title: f.title, note: f.note, url: cleanAmazonUrl(f.url), image: f.image_url,
    shelf: f.shelf, badge: f.badge, featured: f.featured, popular: popular.has(f.id),
    pairsWith: f.pairs_with && pName[f.pairs_with] ? { id: f.pairs_with, name: pName[f.pairs_with] } : null,
  })))
}
