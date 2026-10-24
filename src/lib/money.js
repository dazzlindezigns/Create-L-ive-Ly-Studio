// Pure money helpers shared by the browser and the /api functions.
// The server always recomputes amounts with these — never trust a client-sent total.

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)

// Deposit owed on an order before production starts.
export function depositFor(order) {
  const price = Number(order.price) || 0
  const amt = Number(order.deposit_amount) || 0
  if (order.deposit_type === 'percent') return round2(price * Math.min(amt, 100) / 100)
  if (order.deposit_type === 'fixed') return round2(Math.min(amt, price))
  return round2(price)
}

// What the customer can pay right now.
// Returns { price, paid, remaining, deposit, options: [{ kind, amount, label }] }
export function paymentOptions(order) {
  const price = round2(order.price)
  const paid = round2(order.amount_paid)
  const remaining = Math.max(0, round2(price - paid))
  const deposit = depositFor(order)
  const options = []

  if (remaining > 0) {
    if (!order.deposit_paid && paid === 0 && order.deposit_type !== 'full' && deposit > 0 && deposit < price) {
      options.push({ kind: 'deposit', amount: deposit, label: `Pay deposit (${fmt(deposit)})` })
      options.push({ kind: 'full', amount: remaining, label: `Pay in full (${fmt(remaining)})` })
    } else if (paid > 0) {
      options.push({ kind: 'balance', amount: remaining, label: `Pay remaining balance (${fmt(remaining)})` })
    } else {
      options.push({ kind: 'full', amount: remaining, label: `Pay ${fmt(remaining)}` })
    }
  }
  return { price, paid, remaining, deposit, options }
}

// What can still be refunded, per payment: card payments first (they go back to the card
// through Stripe), newest first; then payments made another way (she returns those herself).
// payments = rows from the payments table; refunds are rows with kind 'refund' and refund_of.
export function refundable(payments = []) {
  const refunded = (id) => payments.filter(r => r.kind === 'refund' && r.refund_of === id).reduce((s, r) => s + Number(r.amount || 0), 0)
  const isCard = (p) => Boolean(p.stripe_payment_intent_id || p.stripe_session_id)
  const list = payments
    .filter(p => p.status === 'paid' && p.kind !== 'refund')
    .map(p => ({ payment: p, card: isCard(p), left: round2(Number(p.amount || 0) - refunded(p.id)) }))
    .filter(x => x.left > 0)
    .sort((a, b) => (b.card - a.card) || new Date(b.payment.paid_at || b.payment.created_at) - new Date(a.payment.paid_at || a.payment.created_at))
  const total = round2(list.reduce((s, x) => s + x.left, 0))
  const card = round2(list.filter(x => x.card).reduce((s, x) => s + x.left, 0))
  return { list, total, card, other: round2(total - card) }
}
