import { db, requireMethod, requireAdmin, HttpError } from '../_lib/core.js'
import { PUBLIC_KEYS } from './get-settings.js'
import { normalizeTiers, licenseFromSettings } from '../../src/lib/cart.js'

export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const { key } = req.body || {}
  let { value } = req.body || {}
  if (!PUBLIC_KEYS.includes(key)) throw new HttpError(400, 'Unknown setting')
  if (key === 'stack_save_tiers' || key === 'sticker_bar_tiers') value = normalizeTiers(value).reverse()
  if (key === 'shop_free_shipping_over' || key === 'shop_shipping_fee') value = Math.max(0, Number(value) || 0)
  if (key === 'business_license') value = licenseFromSettings({ business_license: value })
  const { error } = await db().from('settings').upsert({ key, value })
  if (error) throw new HttpError(500, error.message)
  return res.status(200).json({ ok: true })
}
