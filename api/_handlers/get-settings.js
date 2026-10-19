import { db, requireMethod, HttpError } from '../_lib/core.js'

// Only these keys are readable without signing in.
export const PUBLIC_KEYS = ['shop_open', 'shop_closed_message', 'shop_shipping_fee', 'shop_free_shipping_over', 'stack_save_tiers', 'sticker_bar_tiers', 'in_person_payment_note']

export default async function handler(req, res) {
  requireMethod(req, 'GET')
  const { data, error } = await db().from('settings').select('key, value').in('key', PUBLIC_KEYS)
  if (error) throw new HttpError(500, error.message)
  const out = {}
  for (const row of data || []) out[row.key] = row.value
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json(out)
}
