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
  payment_pending:     s('Awaiting payment',   COLORS.warning),
  confirmed:           s('Paid / confirmed',   COLORS.plum),
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

// Work queue: things that need the owner's hands, most urgent first.
export const QUEUE_PRIORITY = {
  revisions_requested: 0,
  proof_approved: 1,
  confirmed: 2,
  in_production: 3,
  ready_for_pickup: 4,
  proof_sent: 5,
}

export const FILTER_TABS = [
  { key: 'queue',               label: 'Queue' },
  { key: 'pending',             label: 'New',          badge: true },
  { key: 'quote_sent',          label: 'Quoted' },
  { key: 'payment_pending',     label: 'Unpaid',       badge: true },
  { key: 'revisions_requested', label: 'Changes',      badge: true },
  { key: 'shipped',             label: 'Shipped' },
  { key: 'completed',           label: 'Complete' },
  { key: 'all',                 label: 'All' },
]

export const PIPELINE = [
  { label: 'Quoting',       statuses: ['pending', 'quote_sent', 'invoice_sent', 'payment_pending'], color: COLORS.warning },
  { label: 'Proofing',      statuses: ['confirmed', 'proof_sent', 'revisions_requested'],           color: COLORS.secondary },
  { label: 'Production',    statuses: ['proof_approved', 'in_production'],                          color: COLORS.plum },
  { label: 'Ready',         statuses: ['ready_for_pickup', 'shipped'],                              color: COLORS.primary },
  { label: 'Done',          statuses: ['completed'],                                                color: COLORS.success },
]
