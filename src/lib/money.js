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
