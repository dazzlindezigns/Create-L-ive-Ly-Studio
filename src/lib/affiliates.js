// Partner (affiliate) math shared by the admin pages and /api/get-partner. Keep it pure.
import { round2 } from './money.js'

// Links never expire; this is how long a shopper stays credited to the partner after tapping one.
export const REF_DAYS = 30
export const cleanCode = (s) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30)

// What a partner has earned on one order.
//   state: 'pending' (paid, not complete yet) | 'ready' (complete — pay it) | 'paid' | 'void' (unpaid, cancelled or refunded)
export function commissionFor(o) {
  const full = Number(o.commission) || 0
  const paid = Boolean(o.balance_paid) || (Number(o.price) > 0 && Number(o.amount_paid) >= Number(o.price) - 0.009)
  if (!full || !paid || ['cancelled', 'declined', 'refunded'].includes(o.status)) return { amount: 0, state: 'void' }
  // A partial refund shrinks the commission by the same share.
  const kept = Number(o.amount_paid) > 0 ? Math.max(0, 1 - (Number(o.refunded_amount) || 0) / Number(o.amount_paid)) : 1
  const amount = round2(full * kept)
  if (!amount) return { amount: 0, state: 'void' }
  if (o.commission_payout_id) return { amount, state: 'paid' }
  return { amount, state: o.status === 'completed' ? 'ready' : 'pending' }
}

// Totals for a partner's orders: { pending, ready, paid, sales, count }.
export function partnerTotals(orders = []) {
  const t = { pending: 0, ready: 0, paid: 0, sales: 0, count: 0 }
  for (const o of orders) {
    const c = commissionFor(o)
    if (c.state === 'void') continue
    t[c.state] = round2(t[c.state] + c.amount)
    t.sales = round2(t.sales + Number(o.amount_paid || 0) - Number(o.refunded_amount || 0))
    t.count++
  }
  return t
}
