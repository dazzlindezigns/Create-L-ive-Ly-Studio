import { requireMethod, requireAdmin, BRAND } from '../_lib/core.js'
import { notifyAdmins } from '../_lib/push.js'

export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const configured = Boolean(process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
  const result = await notifyAdmins({ title: `🔔 ${BRAND.shortName}`, body: 'Test notification — push is working!', url: '/dashboard' })
  return res.status(200).json({ configured, ...(result || { sent: 0 }) })
}
