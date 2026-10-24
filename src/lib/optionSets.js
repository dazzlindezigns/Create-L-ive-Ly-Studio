// Saved option sets ("Tumbler colors", "Shirt sizes"…) live in settings.option_sets:
//   [{ id, title, name, choices: [{ label, price }] }]   — title is hers, name is what customers see.
// A product group added from a set keeps `set: <id>`, so changing the set can update those products.
import { round2 } from './money.js'

export const cleanSets = (raw) => (Array.isArray(raw) ? raw : [])
  .filter(s => s?.id && s?.name)
  .map(s => ({
    id: String(s.id), title: String(s.title || s.name), name: String(s.name),
    choices: (s.choices || []).map(c => ({ label: String(c.label || '').trim(), price: round2(c.price) })).filter(c => c.label),
  }))

// A product group made from a set.
export const groupFromSet = (set) => ({ set: set.id, name: set.name, choices: set.choices.map(c => ({ ...c })) })

// Applies a changed set to one product's saved option_groups (stored as price differences).
// Choices keep this product's own price when the label still exists, so per-product pricing survives.
export function applySet(groups, set) {
  let changed = false
  const next = (groups || []).map(g => {
    if (g.set !== set.id) return g
    changed = true
    const old = Object.fromEntries((g.choices || []).map(c => [c.label, c.price]))
    return { ...g, name: set.name, choices: set.choices.map(c => ({ label: c.label, price: c.label in old ? old[c.label] : c.price })) }
  })
  return changed ? next : null
}
