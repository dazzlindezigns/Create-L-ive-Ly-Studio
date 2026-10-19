import { db, requireMethod, requireAdmin, HttpError, isEmail } from '../_lib/core.js'
import { round2 } from '../../src/lib/money.js'

// Creates an order from the Calculator. The customer gets the normal /quote/:id page
// to sign and pay; send it with /api/send-quote afterwards.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const b = req.body || {}

  const customerName = String(b.customerName || '').trim()
  const customerEmail = String(b.customerEmail || '').trim().toLowerCase()
  if (!customerName || !isEmail(customerEmail)) throw new HttpError(400, 'Customer name and a valid email are required')

  const lines = (Array.isArray(b.lines) ? b.lines : [])
    .map(l => ({ description: String(l.description || '').slice(0, 300), qty: Math.max(0, Number(l.qty) || 0), unitPrice: round2(l.unitPrice) }))
    .filter(l => l.description && l.qty > 0)
  if (!lines.length) throw new HttpError(400, 'Add at least one line item')

  const total = round2(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0))
  const depositType = ['full', 'percent', 'fixed'].includes(b.depositType) ? b.depositType : 'full'

  const { data, error } = await db().from('orders').insert({
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: String(b.customerPhone || '').trim() || null,
    product_type: String(b.title || lines[0].description).slice(0, 120),
    description: lines.map(l => `${l.qty} × ${l.description}`).join('\n'),
    quantity: lines.reduce((s, l) => s + l.qty, 0),
    price: total,
    deposit_type: depositType,
    deposit_amount: depositType === 'full' ? total : Number(b.depositAmount) || 0,
    turnaround: String(b.turnaround || '').trim() || null,
    quote_note: String(b.note || '').trim() || null,
    quote_breakdown: { lines, internal: b.internal || null },
    source: b.asQuote ? 'form' : 'invoice',
    status: 'pending',
    payment_methods: ['card'],
  }).select('id').single()
  if (error) throw new HttpError(500, error.message)

  return res.status(200).json({ orderId: data.id, total })
}
