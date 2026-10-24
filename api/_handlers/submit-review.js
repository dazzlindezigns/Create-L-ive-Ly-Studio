import { db, requireMethod, getOrder, HttpError, firstName, APP_URL } from '../_lib/core.js'
import { notifyAdmins } from '../_lib/push.js'
import { layout, rows, button, emailMaker, esc, escBr } from '../_lib/email.js'
import { canReview, reviewableIds } from './get-review.js'

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n)
const cleanRating = (n) => { const r = parseInt(n, 10); return r >= 1 && r <= 5 ? r : null }

// Saves product reviews (public, verified purchase) and shopping feedback (private to her).
// Submitting again updates the same rows, so customers can change their answers.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  const b = req.body || {}
  const order = await getOrder(b.orderId)
  if (!canReview(order)) throw new HttpError(400, 'Reviews open once your order is paid')
  const supabase = db()
  const allowed = new Set(reviewableIds(order))
  const name = String(b.name || '').trim().slice(0, 60) || null
  const now = new Date().toISOString()

  const reviews = (Array.isArray(b.reviews) ? b.reviews : [])
    .map(r => ({ product_id: r.productId, rating: cleanRating(r.rating), body: String(r.body || '').trim().slice(0, 2000) || null }))
    .filter(r => allowed.has(r.product_id) && r.rating)
  const fb = cleanRating(b.feedback?.rating) || String(b.feedback?.body || '').trim()
    ? { rating: cleanRating(b.feedback?.rating), body: String(b.feedback?.body || '').trim().slice(0, 4000) || null }
    : null
  if (!reviews.length && !fb) throw new HttpError(400, 'Tap the stars to leave a rating')

  if (reviews.length) {
    const { error } = await supabase.from('reviews')
      .upsert(reviews.map(r => ({ ...r, order_id: order.id, name, read_at: null, created_at: now })), { onConflict: 'order_id,product_id' })
    if (error) throw new HttpError(500, error.message)
  }
  if (fb) {
    const { error } = await supabase.from('feedback').upsert({ order_id: order.id, ...fb, read_at: null, created_at: now }, { onConflict: 'order_id' })
    if (error) throw new HttpError(500, error.message)
  }

  const names = Object.fromEntries((order.shop_cart || []).map(l => [l.productId, l.productName]))
  const who = firstName(order.customer_name)
  await Promise.all([
    notifyAdmins({
      title: reviews.length ? `⭐ New review from ${who}` : `💬 Feedback from ${who}`,
      body: reviews.length
        ? reviews.map(r => `${names[r.product_id] || 'Product'} ${stars(r.rating)}`).join(' · ')
        : `${fb.rating ? `${stars(fb.rating)} ` : ''}${fb.body || ''}`.slice(0, 140),
      url: '/dashboard/inbox#reviews',
    }),
    emailMaker(`${reviews.length ? '⭐ New review' : '💬 New feedback'} — ${order.customer_name}`, layout({
      heading: reviews.length ? 'New review' : 'New shopping feedback',
      body: rows([
        ['Customer', esc(order.customer_name)],
        ...reviews.map(r => [esc(names[r.product_id] || 'Product'), `${stars(r.rating)}${r.body ? `<br/>${escBr(r.body)}` : ''}`]),
        ...(fb ? [['Shopping experience (private)', `${fb.rating ? stars(fb.rating) : ''}${fb.body ? `<br/>${escBr(fb.body)}` : ''}`]] : []),
      ]) + button('See all reviews →', `${APP_URL}/dashboard/inbox#reviews`),
    })).catch(e => console.error('review email failed', e)),
  ])

  return res.status(200).json({ success: true })
}
