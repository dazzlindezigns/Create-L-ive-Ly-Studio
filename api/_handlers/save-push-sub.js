import { db, requireMethod, requireAdmin, HttpError } from '../_lib/core.js'

export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const { subscription } = req.body || {}
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new HttpError(400, 'Invalid subscription')
  }
  const { error } = await db().from('push_subscriptions').upsert({ subscription }, { onConflict: 'endpoint' })
  if (error) throw new HttpError(500, error.message)
  return res.status(200).json({ success: true })
}
