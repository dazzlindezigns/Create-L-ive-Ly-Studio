import { db, requireMethod, getOrder, publicOrder } from '../_lib/core.js'

// Customer-facing order lookup for /quote/:id and /proof/:id.
// The order UUID is the access token; admin-only fields are stripped.
export default async function handler(req, res) {
  requireMethod(req, 'GET')
  const order = await getOrder(req.query.id)

  const { data: settings } = await db().from('settings').select('key, value').in('key', ['in_person_payment_note'])
  const inPersonNote = settings?.find(s => s.key === 'in_person_payment_note')?.value || null

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ ...publicOrder(order), _inPersonNote: inPersonNote })
}
