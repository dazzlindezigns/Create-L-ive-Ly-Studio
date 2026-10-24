import { db, HttpError } from '../_lib/core.js'
import { sendStageEmail } from './send-status-update.js'

// Daily (vercel.json cron): one friendly "leave a review" email per completed order, REMIND_AFTER_DAYS
// after it was completed, only if they haven't left a review or feedback and haven't been asked yet.
// Orders completed more than MAX_AGE_DAYS ago are skipped so old customers aren't surprised.
const REMIND_AFTER_DAYS = 5
const MAX_AGE_DAYS = 30
const DAY = 86400000

export default async function handler(req, res) {
  // Vercel sends "Authorization: Bearer <CRON_SECRET>" when that env var is set.
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'Not allowed')
  const supabase = db()
  const now = Date.now()

  const { data: orders, error } = await supabase.from('orders')
    .select('*')
    .eq('status', 'completed')
    .is('review_reminder_sent_at', null)
    .not('customer_email', 'is', null)
    .lte('completed_at', new Date(now - REMIND_AFTER_DAYS * DAY).toISOString())
    .gte('completed_at', new Date(now - MAX_AGE_DAYS * DAY).toISOString())
    .limit(50)
  if (error) throw new HttpError(500, error.message)
  if (!orders?.length) return res.status(200).json({ sent: 0 })

  const ids = orders.map(o => o.id)
  const [{ data: reviewed }, { data: answered }] = await Promise.all([
    supabase.from('reviews').select('order_id').in('order_id', ids),
    supabase.from('feedback').select('order_id').in('order_id', ids),
  ])
  const done = new Set([...(reviewed || []), ...(answered || [])].map(r => r.order_id))

  let sent = 0
  for (const o of orders) {
    if (done.has(o.id)) {
      // Already heard from them — mark it so they're never asked.
      await supabase.from('orders').update({ review_reminder_sent_at: new Date().toISOString() }).eq('id', o.id)
      continue
    }
    try { await sendStageEmail(o, 'review_request'); sent++ }
    catch (e) { console.error('review reminder failed', o.id, e.message) }
  }
  return res.status(200).json({ sent })
}
