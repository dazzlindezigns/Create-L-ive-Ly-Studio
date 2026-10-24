import { COLORS } from '../brand'

const tint = (hex, a) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}
const s = (label, color) => ({ label, color, bg: tint(color, 0.13) })

export const STATUS = {
  pending:             s('New request',        COLORS.warning),
  quote_sent:          s('Quote sent',         COLORS.secondary),
  invoice_sent:        s('Invoice sent',       COLORS.plum),
  payment_pending:     s('Not paid yet',       COLORS.warning),
  confirmed:           s('Paid',               COLORS.plum),
  proof_sent:          s('Proof sent',         COLORS.secondary),
  revisions_requested: s('Changes requested',  COLORS.primary),
  proof_approved:      s('Proof approved',     COLORS.success),
  in_production:       s('In production',      COLORS.secondary),
  ready_for_pickup:    s('Ready for pickup',   COLORS.primary),
  shipped:             s('Shipped',            COLORS.secondary),
  completed:           s('Complete',           COLORS.success),
  declined:            s('Declined',           COLORS.danger),
  cancelled:           s('Cancelled',          '#888888'),
}

export const STATUS_ORDER = Object.keys(STATUS)

// Three kinds of orders, three flows:
//   shop    — a physical item bought in the shop: paid → pack/make → ship or pickup → complete
//   digital — downloads only: complete the moment it's paid (the download link is emailed)
//   custom  — a request or invoice: quote → paid → proof → make → ship or pickup → complete
export const orderFlow = (o) => o.source === 'shop' ? (o.fulfillment === 'digital' ? 'digital' : 'shop') : 'custom'

const handoffStatus = (o) => o.fulfillment === 'shipping' ? 'shipped' : 'ready_for_pickup'

// The statuses that make sense for this order (the current one is always kept in the list).
export function statusesFor(o) {
  const flow = orderFlow(o)
  const list = flow === 'digital' ? ['payment_pending', 'completed', 'cancelled']
    : flow === 'shop' ? ['payment_pending', 'confirmed', 'in_production', handoffStatus(o), 'completed', 'cancelled']
    : [...(o.source === 'invoice' ? ['invoice_sent'] : ['pending', 'quote_sent']), 'confirmed', 'proof_sent', 'revisions_requested',
       'proof_approved', 'in_production', handoffStatus(o), 'completed', 'declined', 'cancelled']
  return list.includes(o.status) ? list : [o.status, ...list]
}

// Step tracker shown at the top of the order page.
export function stepsFor(o) {
  const flow = orderFlow(o)
  const handoff = o.fulfillment === 'shipping' ? 'Shipped' : 'Ready'
  const steps = flow === 'digital' ? [['Paid', ['payment_pending']], ['Delivered', ['completed']]]
    : flow === 'shop' ? [['Paid', ['payment_pending']], ['Pack', ['confirmed', 'in_production']], [handoff, ['ready_for_pickup', 'shipped']], ['Done', ['completed']]]
    : [['Quote', ['pending', 'quote_sent', 'invoice_sent', 'payment_pending']], ['Proof', ['confirmed', 'proof_sent', 'revisions_requested']],
       ['Make', ['proof_approved', 'in_production']], [handoff, ['ready_for_pickup', 'shipped']], ['Done', ['completed']]]
  const current = steps.findIndex(([, statuses]) => statuses.includes(o.status))
  return { steps: steps.map(([label]) => label), current }
}

// The one thing to do next. Exactly one of:
//   { label, action, status?, email?, hint, short }  — a button (action: status | ship | quote | proof)
//   { waiting, short }                                — nothing to do until the customer or carrier moves
//   { done, short }                                   — finished
// `alt` is an optional second, smaller choice.
export function nextStep(o) {
  const flow = orderFlow(o)
  const handoff = o.fulfillment === 'shipping'
    ? { label: '📦 Mark shipped', action: 'ship', short: 'Ship it', hint: 'Add the tracking number — the customer gets a tracking email.' }
    : { label: '🎉 Ready for pickup', action: 'status', status: 'ready_for_pickup', email: 'ready_for_pickup', short: 'Ready for pickup', hint: 'Tells the customer it’s ready and asks when they’ll come by.' }

  switch (o.status) {
    case 'pending':
      return { label: '💬 Write the quote', action: 'quote', short: 'Write quote', hint: 'Price it below, then send — they review, sign and pay online.' }
    case 'quote_sent': case 'invoice_sent':
      return { waiting: 'Waiting for the customer to sign and pay.', short: 'Waiting on payment' }
    case 'payment_pending':
      return { waiting: flow === 'custom' ? 'Waiting for the customer to pay.' : 'They started checkout but haven’t paid. Nothing to do — it moves forward by itself once they pay.', short: 'Not paid yet' }
    case 'confirmed':
      if (flow === 'custom') return { label: '🖼 Send the proof', action: 'proof', short: 'Send proof', hint: 'Upload the design below and email it for approval.',
        alt: { label: 'No proof needed — start making', status: 'in_production', email: 'in_production' } }
      return { ...handoff, short: o.fulfillment === 'shipping' ? 'Pack & ship' : 'Pack for pickup',
        alt: { label: 'Needs to be made first? Mark in production', status: 'in_production', email: 'in_production' } }
    case 'proof_sent':
      return { waiting: 'Waiting for the customer to approve the proof.', short: 'Waiting on approval',
        alt: { label: 'They approved by text — mark approved', status: 'proof_approved' } }
    case 'revisions_requested':
      return { label: '✏️ Send the updated proof', action: 'proof', short: 'Update proof', hint: 'Their notes are in the Proofs section below.' }
    case 'proof_approved':
      return { label: '✂️ Start making it', action: 'status', status: 'in_production', email: 'in_production', short: 'Start making', hint: 'Lets the customer know it’s being made.' }
    case 'in_production':
      return handoff
    case 'ready_for_pickup':
      return { label: '✓ Picked up — complete', action: 'status', status: 'completed', email: 'completed', short: 'Waiting for pickup', hint: 'Tap when they’ve picked it up.' }
    case 'shipped':
      return { label: '✓ Delivered — complete', action: 'status', status: 'completed', email: 'completed', short: 'On the way', hint: 'Tap once it’s delivered.' }
    case 'completed':
      return { done: flow === 'digital' ? 'Delivered — the download link was emailed when they paid.' : 'All done 🎉', short: 'Done' }
    default:
      return { done: `This order was ${STATUS[o.status]?.label.toLowerCase() || o.status}.`, short: STATUS[o.status]?.label || o.status }
  }
}

// "To do" = waiting on her (most urgent first). Shipped / ready for pickup wait on someone else.
export const TODO_PRIORITY = {
  revisions_requested: 0,
  proof_approved: 1,
  confirmed: 2,
  pending: 3,
  in_production: 4,
}
const WAITING = ['quote_sent', 'invoice_sent', 'payment_pending', 'proof_sent', 'ready_for_pickup', 'shipped']

// A shop checkout that wasn't paid within a day is abandoned (Stripe's link has expired).
export const isAbandoned = (o) => o.source === 'shop' && o.status === 'payment_pending' && Date.now() - new Date(o.created_at) > 86400000

export const FILTER_TABS = [
  { key: 'todo',    label: 'To do',   badge: true, match: (o) => o.status in TODO_PRIORITY },
  { key: 'waiting', label: 'Waiting', match: (o) => WAITING.includes(o.status) && !isAbandoned(o) },
  { key: 'done',    label: 'Done',    match: (o) => o.status === 'completed' },
  { key: 'all',     label: 'All',     match: () => true },
]

export const PIPELINE = [
  { label: 'Quoting',       statuses: ['pending', 'quote_sent', 'invoice_sent'],          color: COLORS.warning },
  { label: 'Proofing',      statuses: ['proof_sent', 'revisions_requested'],              color: COLORS.secondary },
  { label: 'To make',       statuses: ['confirmed', 'proof_approved', 'in_production'],   color: COLORS.plum },
  { label: 'Out',           statuses: ['ready_for_pickup', 'shipped'],                    color: COLORS.primary },
  { label: 'Done',          statuses: ['completed'],                                      color: COLORS.success },
]
