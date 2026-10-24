import { db, requireMethod, HttpError } from '../_lib/core.js'
import { PAYOUT_METHODS } from '../../src/brand.js'

// Partners add how they want to be paid from their own page (token = their private link).
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  const { token, method, handle } = req.body || {}
  if (!/^[0-9a-f-]{36}$/i.test(String(token || ''))) throw new HttpError(404, 'Link not found')
  const m = PAYOUT_METHODS.includes(method) ? method : null
  const h = String(handle || '').trim().slice(0, 120)
  if (!m || !h) throw new HttpError(400, 'Pick how you’d like to be paid and add your name or handle')
  const { data, error } = await db().from('affiliates').update({ payout_method: m, payout_handle: h }).eq('token', token).select('id')
  if (error) throw new HttpError(500, error.message)
  if (!data?.length) throw new HttpError(404, 'Link not found')
  return res.status(200).json({ success: true })
}
