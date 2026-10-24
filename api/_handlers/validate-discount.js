import { requireMethod } from '../_lib/core.js'
import { findDiscount, discountAmount } from '../_lib/pricing.js'

export default async function handler(req, res) {
  requireMethod(req, 'POST')
  const { code, subtotal } = req.body || {}
  const found = await findDiscount(code)
  if (found.error) return res.status(200).json({ valid: false, error: found.error })
  const d = found.row
  return res.status(200).json({
    valid: true,
    code: d.code,
    type: d.discount_type,
    value: Number(d.discount_value),
    minOrder: Number(d.min_order) || 0,
    discountAmount: discountAmount(d, Number(subtotal) || 0),
  })
}
