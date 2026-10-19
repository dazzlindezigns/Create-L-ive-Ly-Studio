import { db, requireMethod, requireAdmin, HttpError } from '../_lib/core.js'
import { PUBLIC_KEYS } from './get-settings.js'

export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const { key, value } = req.body || {}
  if (!PUBLIC_KEYS.includes(key)) throw new HttpError(400, 'Unknown setting')
  const { error } = await db().from('settings').upsert({ key, value })
  if (error) throw new HttpError(500, error.message)
  return res.status(200).json({ ok: true })
}
