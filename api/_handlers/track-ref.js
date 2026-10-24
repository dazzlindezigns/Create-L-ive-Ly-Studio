import { db, requireMethod } from '../_lib/core.js'
import { cleanCode } from '../../src/lib/affiliates.js'

// Counts a visit from a partner link (?ref=CODE). Fire-and-forget from the browser; never fails loudly.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  const code = cleanCode(req.body?.code)
  if (code) {
    const { error } = await db().rpc('count_affiliate_click', { p_code: code })
    if (error) console.error('track-ref:', error.message)
  }
  return res.status(204).end()
}
