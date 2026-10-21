// Shop cart math shared by the browser (display) and api/_lib/pricing.js (what is charged).
// Keep it pure — the server always re-prices from the products table before charging.
import { round2 } from './money.js'
import { STACK_TIERS, STICKER_BAR } from '../brand.js'

const sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0)

// Settings value → clean tiers, highest first. Falls back to the brand defaults.
export function normalizeTiers(raw) {
  const list = (Array.isArray(raw) ? raw : [])
    .map(t => ({ min: parseInt(t?.min, 10), pct: Number(t?.pct) }))
    .filter(t => t.min >= 2 && t.pct > 0 && t.pct <= 90)
    .slice(0, 6)
  return (list.length ? list : STACK_TIERS).slice().sort((a, b) => b.min - a.min)
}

// Saved tiers from the settings table (older installs saved them as sticker_bar_tiers).
export const tiersFromSettings = (s = {}) => normalizeTiers(s.stack_save_tiers ?? s.sticker_bar_tiers)

export const tierFor = (tiers, qty) => normalizeTiers(tiers).find(t => qty >= t.min) || null

// Which price a product line uses. Digital-only products are always digital; a physical
// product offers a download too when it has a digital price and an uploaded file.
export const offersDigital = (p) => p.kind === 'digital' || (p.digital_price != null && Boolean(p.digital_file_name || p.digital_file_path))
export const offersPhysical = (p) => p.kind !== 'digital'
export function lineFormat(p, wanted) {
  if (p.kind === 'digital') return 'digital'
  return wanted === 'digital' && offersDigital(p) ? 'digital' : 'physical'
}
export const unitPrice = (p, format) => round2(format === 'digital' && p.kind !== 'digital' ? p.digital_price : p.price)
// Option groups the buyer picks from (physical format only), e.g. Size, Color, Sticker style.
// Each choice can change the price. Older products stored a flat `options` list — read as one group.
export function optionGroups(p) {
  const raw = Array.isArray(p.option_groups) && p.option_groups.length ? p.option_groups
    : p.options?.length ? [{ name: 'Option', choices: p.options.map(label => ({ label, price: 0 })) }] : []
  return raw
    .map(g => ({
      name: String(g?.name || 'Option').trim().slice(0, 40),
      choices: (Array.isArray(g?.choices) ? g.choices : [])
        .map(c => ({ label: String(c?.label || '').trim().slice(0, 60), price: round2(c?.price) }))
        .filter(c => c.label),
    }))
    .filter(g => g.choices.length)
}

// Wanted picks ({ Size: '4 inch' }) → valid picks (first choice when missing or unknown),
// the extra per-unit cost, and a readable label like "Size: 4 inch · Style: Die-cut".
export function resolveOptions(p, wanted = {}) {
  const groups = optionGroups(p)
  const picks = groups.map(g => {
    const c = g.choices.find(x => x.label === wanted?.[g.name]) || g.choices[0]
    return { group: g.name, label: c.label, price: c.price }
  })
  return {
    selections: picks.length ? Object.fromEntries(picks.map(x => [x.group, x.label])) : null,
    extra: round2(sum(picks, x => x.price)),
    text: picks.map(x => (groups.length === 1 && x.group === 'Option' ? x.label : `${x.group}: ${x.label}`)).join(' · ') || null,
  }
}

export const isSticker = (p) => p.collection === STICKER_BAR.collection

// code = discount_codes row shape: { discount_type: 'percent'|'fixed', discount_value }
export function discountAmount(code, base) {
  if (!code) return 0
  const v = Number(code.discount_value) || 0
  return code.discount_type === 'percent'
    ? round2(base * Math.min(v, 100) / 100)
    : round2(Math.min(v, base))
}

// lines: [{ itemTotal, quantity, bulkEligible }]
// Stack & Save: every eligible item in the cart (any product, any format) counts toward one tier.
export function cartTotals(lines, { stackTiers, code = null, shippingFee = 0, freeShippingOver = 0 } = {}) {
  const subtotal = round2(sum(lines, l => l.itemTotal))
  const stack = lines.filter(l => l.bulkEligible)
  const stackTier = tierFor(stackTiers, sum(stack, l => l.quantity))
  const stackDiscount = stackTier ? round2(sum(stack, l => l.itemTotal) * stackTier.pct / 100) : 0

  const afterTiers = round2(subtotal - stackDiscount)
  const codeDiscount = discountAmount(code, afterTiers)
  const merchandise = round2(afterTiers - codeDiscount)

  const fee = round2(shippingFee)
  const threshold = Number(freeShippingOver) || 0
  const freeShipping = fee > 0 && threshold > 0 && merchandise >= threshold
  const shipping = freeShipping ? 0 : fee
  const total = Math.max(0, round2(merchandise + shipping))
  return { subtotal, stackTier, stackDiscount, codeDiscount, merchandise, freeShipping, shipping, total }
}
