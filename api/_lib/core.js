import { createClient } from '@supabase/supabase-js'
import { BRAND } from '../../src/brand.js'

export const APP_URL = (process.env.VITE_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
export const MAKER_EMAIL = process.env.MAKER_EMAIL || ''

let _db
export function db() {
  if (_db) return _db
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new HttpError(500, 'Supabase is not configured')
  _db = createClient(url, key, { auth: { persistSession: false } })
  return _db
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function requireMethod(req, method) {
  if (req.method !== method) throw new HttpError(405, 'Method not allowed')
}

// Verifies the Supabase access token sent as `Authorization: Bearer <jwt>`
// and that the user is listed in admin_users. Throws 401/403 otherwise.
export async function requireAdmin(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Not signed in')
  const supabase = db()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) throw new HttpError(401, 'Session expired — sign in again')
  const { data: admin } = await supabase
    .from('admin_users').select('user_id').eq('user_id', data.user.id).maybeSingle()
  if (!admin) throw new HttpError(403, 'This account is not an admin')
  return data.user
}

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim())

export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there'

export async function getOrder(id) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'Order not found')
  const { data, error } = await db().from('orders').select('*').eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Order not found')
  return data
}

// Fields customers must never see. po_number is admin-only by design.
const ADMIN_ONLY = ['po_number', 'internal_notes', 'shipping_label_url']

export function publicOrder(order) {
  const out = { ...order }
  for (const k of ADMIN_ONLY) delete out[k]
  // Calculator breakdown keeps supply costs + labor internally; customers only see invoice lines.
  out.quote_breakdown = order.quote_breakdown?.lines ? { lines: order.quote_breakdown.lines } : null
  // Storage paths for digital files stay server-side; customers get signed links via /api/get-downloads.
  if (Array.isArray(order.shop_cart)) out.shop_cart = order.shop_cart.map(({ digitalFilePath, ...line }) => line)
  return out
}

export { BRAND }
