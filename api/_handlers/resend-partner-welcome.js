import { db, requireMethod, requireAdmin, HttpError, isEmail } from '../_lib/core.js'
import { sendPartnerWelcome } from '../_lib/partners.js'

// Admin: send (or resend) a partner's welcome email with their private page link.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const { data: p } = await db().from('affiliates').select('*').eq('id', req.body?.partnerId || '').maybeSingle()
  if (!p) throw new HttpError(404, 'Partner not found')
  if (!isEmail(p.email)) throw new HttpError(400, 'Add their email first')
  await sendPartnerWelcome(p)
  return res.status(200).json({ success: true })
}
