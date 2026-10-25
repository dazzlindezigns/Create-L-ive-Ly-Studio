import { db, requireMethod } from '../_lib/core.js'

// Counts a tap on "Get it on Amazon". Fire-and-forget (sendBeacon) — the link itself goes straight to Amazon.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const id = String(body?.id || '')
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const { error } = await db().rpc('count_find_click', { p_id: id })
    if (error) console.error('track-find:', error.message)
  }
  return res.status(204).end()
}
