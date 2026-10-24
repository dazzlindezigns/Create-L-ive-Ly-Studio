import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api, uploadFile, APP_URL } from '../lib/api'
import { fmt, round2 } from '../lib/money'
import { COLLECTIONS, STICKER_BAR, SHOP_CLOSED_TEMPLATE } from '../brand'
import { normalizeTiers, tiersFromSettings, optionGroups } from '../lib/cart'
import Nav from '../components/Nav'
import { ui, Button, Field, Input, TextArea, Select, Loading, Modal, useFlash } from '../components/ui'

// Option presets. Prices are the change from the base price (0 = same price).
const choice = (label, price = 0) => ({ label, price })
const STICKER_STYLE = () => ({ name: 'Style', choices: [choice('Sticker sheet'), choice('Die-cut stickers')] })
const OPTION_PRESETS = [
  ['Size', () => ({ name: 'Size', choices: [choice('Small'), choice('Medium'), choice('Large')] })],
  ['Color', () => ({ name: 'Color', choices: [choice('Blush'), choice('Gold'), choice('White')] })],
  ['Sticker style', STICKER_STYLE],
  ['Custom', () => ({ name: '', choices: [choice('')] })],
]

const BLANK = { kind: 'physical', collection: '', series: '', badge: '', name: '', description: '', price: '', digital_price: '', sell_digital: false, stock: '', option_groups: [], image_urls: [], digital_file_path: null, digital_file_name: null, bulk_pricing_enabled: true, active: true, sort_order: 0 }
const BLANK_DIGITAL = { ...BLANK, kind: 'digital', collection: 'paper-studio', bulk_pricing_enabled: false }
// Sticker Bar sheet: one listing, sold as vinyl AND as a download (prices from her mockups).
const BLANK_SHEET = { ...BLANK, collection: STICKER_BAR.collection, price: 6.5, digital_price: 4, sell_digital: true, option_groups: [STICKER_STYLE()], description: 'A sheet of 12 premium waterproof vinyl stickers. Perfect for planners, journals, laptops and water bottles.' }
const LOW_STOCK = 5
// In the editor, the group whose choices set the price ("own prices") holds full prices;
// saved data keeps the cheapest as the product price and each choice as a difference from it.
const formGroups = (p) => {
  const groups = optionGroups(p)
  const i = groups.findIndex(g => g.choices.some(c => c.price !== 0))
  return groups.map((g, j) => j !== i ? g : { ...g, ownPrices: true, choices: g.choices.map(c => ({ ...c, price: round2(Number(p.price) + c.price) })) })
}
const toForm = (p) => ({ ...p, option_groups: formGroups(p), series: p.series || '', badge: p.badge || '', stock: p.stock ?? '', digital_price: p.digital_price ?? '', sell_digital: p.kind !== 'digital' && p.digital_price != null })
const MAX_DIGITAL_MB = 50 // matches the digital-products bucket limit in supabase/migrations/

export default function AdminProducts() {
  const navigate = useNavigate()
  const [products, setProducts] = useState(null)
  const [codes, setCodes] = useState(null)
  const [settings, setSettings] = useState({})
  const [editing, setEditing] = useState(null)
  const [toast, flash] = useFlash()

  const load = async () => {
    const [{ data: p }, { data: c }, s] = await Promise.all([
      supabase.from('products').select('*').order('sort_order').order('created_at'),
      supabase.from('discount_codes').select('*').order('created_at', { ascending: false }),
      supabase.from('settings').select('key, value'),
    ])
    setProducts(p || []); setCodes(c || []); setSettings(Object.fromEntries((s.data || []).map(r => [r.key, r.value])))
  }
  useEffect(() => { load() }, [])

  // Settings are written straight to Supabase as the signed-in admin (RLS allows it).
  const saveSetting = async (key, raw) => {
    const value = key === 'stack_save_tiers' ? normalizeTiers(raw).reverse()
      : ['shop_shipping_fee', 'shop_free_shipping_over'].includes(key) ? Math.max(0, Number(raw) || 0) : raw
    const { error } = await supabase.from('settings').upsert({ key, value })
    if (error) return flash(error.message, 'error')
    setSettings(s => ({ ...s, [key]: value })); flash('Saved')
  }

  // Products grouped under their collection; anything without one goes last.
  const groups = [
    ...COLLECTIONS.map(c => ({ key: c.key, name: c.name, items: products?.filter(p => p.collection === c.key) || [] })),
    { key: '', name: 'No collection', items: products?.filter(p => !COLLECTIONS.some(c => c.key === p.collection)) || [] },
  ].filter(g => g.key || g.items.length)
  const blankFor = (key) => key === STICKER_BAR.collection ? BLANK_SHEET : key === 'paper-studio' ? BLANK_DIGITAL : { ...BLANK, collection: key }

  if (!products) return <div style={ui.page} className="admin-page"><Loading /><Nav /></div>

  return (
    <div style={ui.page} className="admin-page">
      <div style={{ ...ui.wrap, maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={ui.eyebrow}>Shop</div>
            <h1 style={ui.h1}>Products</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button small variant="ghost" onClick={() => setEditing(BLANK_SHEET)}>+ Sticker sheet</Button>
            <Button small variant="ghost" onClick={() => setEditing(BLANK_DIGITAL)}>+ Digital</Button>
            <Button small onClick={() => setEditing(BLANK)}>+ Physical</Button>
          </div>
        </header>

        <div style={{ ...ui.card, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--mid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{APP_URL}/shop/products</span>
          <Button small variant="ghost" onClick={() => navigator.clipboard.writeText(`${APP_URL}/shop/products`).then(() => flash('Shop link copied'))}>Copy</Button>
        </div>
        <div style={{ ...ui.row, gap: 8 }}>
          <Button small variant="ghost" onClick={() => navigate('/dashboard/partners')}>🤝 Partners</Button>
          <Button small variant="ghost" onClick={() => navigate('/dashboard/inbox#reviews')}>⭐ Reviews</Button>
        </div>

        {groups.map(g => (
          <section key={g.key || 'none'}>
            <div style={styles.groupHead}>
              <h2 style={{ ...ui.h2, marginBottom: 0 }}>{g.name} <span style={styles.count}>{g.items.length}</span></h2>
              <button onClick={() => setEditing(blankFor(g.key))} style={styles.groupAdd}>+ Add</button>
            </div>
            {g.items.length === 0 ? (
              <div style={styles.emptyGroup}>Nothing here yet.</div>
            ) : (
              <div style={styles.list}>
                {g.items.map(p => <ProductRow key={p.id} p={p} onClick={() => setEditing(toForm(p))} />)}
              </div>
            )}
          </section>
        ))}

        <StackTiers key={JSON.stringify(tiersFromSettings(settings))} value={tiersFromSettings(settings)} onSave={v => saveSetting('stack_save_tiers', v)} />

        <DiscountCodes codes={codes} reload={load} flash={flash} />

        <section style={ui.card}>
          <h2 style={ui.h2}>Shop settings</h2>
          <SettingField label="Flat shipping fee ($)" type="number" value={settings.shop_shipping_fee ?? 0} onSave={v => saveSetting('shop_shipping_fee', Number(v) || 0)} />
          <SettingField label="Free shipping when the order is at least ($) — 0 turns it off" type="number" value={settings.shop_free_shipping_over ?? 0} onSave={v => saveSetting('shop_free_shipping_over', Number(v) || 0)} />
          <SettingField label="Message when shop is closed" multiline value={settings.shop_closed_message || ''} onSave={v => saveSetting('shop_closed_message', v)}
            template={SHOP_CLOSED_TEMPLATE} />
          <SettingField label="In-person payment instructions (shown on quotes)" value={settings.in_person_payment_note || ''} onSave={v => saveSetting('in_person_payment_note', v)} />
          <p style={ui.hint}>Open/close the shop from the Orders dashboard.</p>
        </section>
      </div>

      {editing && <ProductModal product={editing} seriesList={[...new Set(products.map(x => x.series).filter(Boolean))]} onClose={() => setEditing(null)} onSaved={(msg) => { setEditing(null); flash(msg); load() }} flash={flash} />}
      {toast}
      <Nav />
    </div>
  )
}

// Option groups (Size, Color, Sticker style…). Customers pick one choice per group on the
// product page; a choice's price is added to (or taken off) the base price.
function OptionGroupsEditor({ groups, onChange }) {
  const setGroup = (i, patch) => onChange(groups.map((g, j) => j === i ? { ...g, ...patch } : g))
  const setChoice = (i, k, patch) => setGroup(i, { choices: groups[i].choices.map((c, j) => j === k ? { ...c, ...patch } : c) })
  // One group can carry the prices (e.g. Size: Small $10 / Large $15); the rest are just names.
  const setOwnPrices = (i, on) => onChange(groups.map((g, j) => j === i
    ? { ...g, ownPrices: on, choices: g.choices.map(c => ({ ...c, price: 0 })) }
    : on && g.ownPrices ? { ...g, ownPrices: false, choices: g.choices.map(c => ({ ...c, price: 0 })) } : g))
  return (
    <div>
      <div style={ui.label}>Options</div>
      {groups.length === 0 && <div style={{ ...ui.hint, marginBottom: 8 }}>No options — customers just pick a quantity. Add sizes, colors, or sticker style below.</div>}
      {groups.map((g, i) => (
        <div key={i} style={styles.optGroup}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input value={g.name} placeholder="Option name (e.g. Size)" onChange={e => setGroup(i, { name: e.target.value })} style={{ fontWeight: 700 }} />
            <button type="button" onClick={() => onChange(groups.filter((_, j) => j !== i))} style={styles.optRemove}>Remove</button>
          </div>
          {g.choices.map((c, k) => (
            <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
              <Input value={c.label} placeholder="Choice" onChange={e => setChoice(i, k, { label: e.target.value })} style={{ flex: 2, padding: '9px 10px', fontSize: 14 }} />
              {(g.ownPrices || g.choices.some(x => x.price)) && (
                <Input id={g.ownPrices && k === 0 ? 'option-prices' : undefined} type="number" step="0.01" min="0" inputMode="decimal"
                  value={c.price === 0 ? '' : c.price} placeholder={g.ownPrices ? '$ Price' : '+$0'}
                  title={g.ownPrices ? 'Price for this choice' : 'Extra cost for this choice'}
                  onChange={e => setChoice(i, k, { price: e.target.value === '' ? 0 : Number(e.target.value) })} style={{ flex: 1, minWidth: 80, padding: '9px 10px', fontSize: 14 }} />
              )}
              <button type="button" onClick={() => setGroup(i, { choices: g.choices.filter((_, j) => j !== k) })} style={{ ...styles.x, position: 'static', flexShrink: 0 }} aria-label="Remove choice">×</button>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setGroup(i, { choices: [...g.choices, choice('')] })} style={styles.optAdd}>+ Add choice</button>
            <label style={{ ...styles.check, fontSize: 13, paddingTop: 8 }}>
              <input type="checkbox" checked={Boolean(g.ownPrices)} onChange={e => setOwnPrices(i, e.target.checked)} /> Each choice has its own price
            </label>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        {OPTION_PRESETS.filter(([label]) => !groups.some(g => g.name === label || (label === 'Sticker style' && g.name === 'Style'))).map(([label, make]) => (
          <button key={label} type="button" onClick={() => onChange([...groups, make()])} style={styles.chip}>+ {label}</button>
        ))}
      </div>
      <div style={{ ...ui.hint, marginTop: 6 }}>The first choice is selected by default. Choices cost the product’s price — unless you tick “Each choice has its own price” on one option (like Size), then type each choice’s price and the main price isn’t needed.</div>
    </div>
  )
}

// Direct link to one product (/p/:id) for texts and social posts — previews with its photo and price.
function ShareLink({ product, flash }) {
  const url = `${APP_URL}/p/${product.id}`
  const share = async () => {
    if (navigator.share && window.matchMedia?.('(pointer: coarse)').matches) {
      try { await navigator.share({ title: product.name, url }); return } catch { /* cancelled — fall back to copy */ }
    }
    navigator.clipboard.writeText(url).then(() => flash('Product link copied 🔗'), () => flash(url))
  }
  return (
    <div style={styles.shareRow}>
      <span style={{ fontSize: 12, color: 'var(--mid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{url}</span>
      <Button small onClick={share}>🔗 Copy link</Button>
      <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700 }}>View ↗</a>
      {!product.active && <div style={{ ...ui.hint, width: '100%', color: 'var(--warning)' }}>This product is hidden — tick “Visible in shop” and save before sharing the link.</div>}
    </div>
  )
}

// Product photos: pick several at once (added in the order picked), first photo is the cover.
// Tap a photo for Make cover / move / remove (works on phones); drag and drop on a computer.
function PhotoManager({ urls, update, setUploading, flash }) {
  const [pending, setPending] = useState([]) // uploads in flight: [{ id, preview }]
  const [selected, setSelected] = useState(null)
  const [dragFrom, setDragFrom] = useState(null)

  const move = (from, to) => {
    if (to < 0 || to >= urls.length || from === to) return
    update(list => { const next = [...list]; const [u] = next.splice(from, 1); next.splice(to, 0, u); return next })
    setSelected(to)
  }

  const onFiles = async (e) => {
    const files = [...e.target.files]
    e.target.value = ''
    if (!files.length) return
    const batch = files.map(f => ({ id: crypto.randomUUID(), file: f, preview: URL.createObjectURL(f) }))
    setPending(prev => [...prev, ...batch])
    setUploading(true)
    // Upload together, but add them in the order they were picked.
    const results = await Promise.allSettled(batch.map(b => uploadFile(b.file, 'product-images', { auth: true })))
    const done = results.filter(r => r.status === 'fulfilled').map(r => r.value)
    if (done.length) update(list => [...list, ...done])
    const failed = results.filter(r => r.status === 'rejected')
    if (failed.length) flash(`${failed.length} photo${failed.length > 1 ? 's' : ''} didn’t upload: ${failed[0].reason.message}`, 'error')
    batch.forEach(b => URL.revokeObjectURL(b.preview))
    setPending(prev => {
      const left = prev.filter(x => !batch.includes(x))
      if (!left.length) setUploading(false)
      return left
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {urls.map((u, i) => (
          <div key={u} draggable onDragStart={() => setDragFrom(i)} onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); if (dragFrom != null) move(dragFrom, i); setDragFrom(null) }}
            onClick={() => setSelected(selected === i ? null : i)}
            style={{ ...styles.photo, outline: selected === i ? '3px solid var(--primary)' : 'none', opacity: dragFrom === i ? 0.4 : 1 }}>
            <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
            {i === 0 && <span style={styles.cover}>Cover</span>}
            <span style={styles.photoNum}>{i + 1}</span>
          </div>
        ))}
        {pending.map(x => (
          <div key={x.id} style={{ ...styles.photo, opacity: 0.5 }}>
            <img src={x.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <span style={{ ...styles.cover, background: 'var(--dark)' }}>Uploading…</span>
          </div>
        ))}
        <label style={{ ...styles.photo, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px dashed var(--border)', color: 'var(--muted)', fontSize: 12, fontWeight: 600, gap: 2 }}>
          <input type="file" accept="image/*" multiple onChange={onFiles} style={{ display: 'none' }} />
          <span style={{ fontSize: 22 }}>+</span>Add photos
        </label>
      </div>
      {selected != null && urls[selected] && (
        <div style={styles.photoBar}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Photo {selected + 1}</span>
          {selected > 0 && <Button small onClick={() => move(selected, 0)}>★ Make cover</Button>}
          <Button small variant="ghost" disabled={selected === 0} onClick={() => move(selected, selected - 1)}>◀</Button>
          <Button small variant="ghost" disabled={selected === urls.length - 1} onClick={() => move(selected, selected + 1)}>▶</Button>
          <Button small variant="ghost" onClick={() => { update(list => list.filter((_, j) => j !== selected)); setSelected(null) }}>Remove</Button>
        </div>
      )}
      <div style={{ ...ui.hint, marginTop: 6 }}>
        Pick several at once — they’re added in the order you pick them. The first photo is the cover in the shop. Tap a photo to move it or make it the cover{typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches ? ', or drag to reorder' : ''}.
      </div>
    </div>
  )
}

// One compact list row: photo, name, price, then status chips on their own line so nothing gets squeezed.
function ProductRow({ p, onClick }) {
  const both = p.kind !== 'digital' && p.digital_price != null
  const chips = [
    !p.active && ['Hidden', 'var(--muted)', 'rgba(0,0,0,0.06)'],
    p.kind === 'digital' && ['Digital', 'var(--primary)', 'var(--card2)'],
    both && ['Vinyl + digital', 'var(--primary)', 'var(--card2)'],
    (p.kind === 'digital' || both) && !p.digital_file_path && ['Needs file', 'var(--danger)', 'rgba(200,65,75,0.08)'],
    p.kind !== 'digital' && p.stock != null && p.stock <= LOW_STOCK && [p.stock ? `${p.stock} left` : 'Sold out', p.stock ? 'var(--warning)' : 'var(--danger)', 'rgba(199,128,43,0.1)'],
    p.badge && [p.badge, 'var(--secondary)', 'var(--card2)'],
  ].filter(Boolean)
  return (
    <button onClick={onClick} style={styles.row}>
      {p.image_urls?.[0] ? <img src={p.image_urls[0]} alt="" style={styles.thumb} /> : <div style={{ ...styles.thumb, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✨</div>}
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={styles.rowName}>{p.name}</div>
        <div style={{ ...ui.muted, marginTop: 2 }}>
          {fmt(p.price)}{both && ` · ${fmt(p.digital_price)} digital`}{p.series && ` · ${p.series}`}
          {p.kind !== 'digital' && p.stock != null && p.stock > LOW_STOCK && ` · ${p.stock} in stock`}
        </div>
        {chips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            {chips.map(([label, color, bg]) => <span key={label} style={{ ...styles.chipTag, color, background: bg }}>{label}</span>)}
          </div>
        )}
      </div>
      <span style={{ color: 'var(--muted)', fontSize: 20, flexShrink: 0 }}>›</span>
    </button>
  )
}

// "Stack & Save": % off every eligible item once the cart holds N+ of them (any products, any formats).
function StackTiers({ value, onSave }) {
  // Remounted (via key) when the saved value changes, so local edits start from it.
  const initial = () => normalizeTiers(value).slice().reverse()
  const [tiers, setTiers] = useState(initial)
  const set = (i, k, v) => setTiers(prev => prev.map((t, j) => j === i ? { ...t, [k]: v } : t))
  const changed = JSON.stringify(tiers) !== JSON.stringify(initial())
  return (
    <section style={ui.card}>
      <h2 style={ui.h2}>Stack & Save</h2>
      <p style={{ ...ui.muted, marginBottom: 12 }}>Customers get this discount when they mix several items from anywhere in the shop. Untick “Counts toward Stack & Save” on a product to leave it out.</p>
      {tiers.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
          <Field label="Buy at least"><Input type="number" min={2} value={t.min} onChange={e => set(i, 'min', e.target.value)} /></Field>
          <Field label="% off"><Input type="number" min={1} max={90} value={t.pct} onChange={e => set(i, 'pct', e.target.value)} /></Field>
          <button onClick={() => setTiers(prev => prev.filter((_, j) => j !== i))} style={{ ...styles.x, position: 'static', flexShrink: 0, marginBottom: 10 }} aria-label="Remove tier">×</button>
        </div>
      ))}
      <div style={ui.row}>
        {tiers.length < 6 && <Button small variant="ghost" onClick={() => setTiers(prev => [...prev, { min: (Number(prev.at(-1)?.min) || 1) + 2, pct: (Number(prev.at(-1)?.pct) || 0) + 5 }])}>+ Add tier</Button>}
        {changed && <Button small onClick={() => onSave(tiers)}>Save tiers</Button>}
      </div>
    </section>
  )
}

function SettingField({ label, value, onSave, type = 'text', multiline, template }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
      <Field label={label} style={{ flex: 1, minWidth: 220 }}
        hint={template && v !== template ? <button type="button" onClick={() => setV(template)} style={styles.useTemplate}>Use the template message</button> : null}>
        {multiline ? <TextArea rows={3} value={v} onChange={e => setV(e.target.value)} /> : <Input type={type} value={v} onChange={e => setV(e.target.value)} />}
      </Field>
      {String(v) !== String(value) && <Button small onClick={() => onSave(v)}>Save</Button>}
    </div>
  )
}

function ProductModal({ product, seriesList, onClose, onSaved, flash }) {
  const [p, setP] = useState(product)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)
  const isDigital = p.kind === 'digital'
  const hasFile = isDigital || p.sell_digital // a download file is part of this listing
  const set = (k) => (e) => setP(prev => ({ ...prev, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  // Digital files go to the PRIVATE digital-products bucket; we store only the path.
  const onDigitalFile = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_DIGITAL_MB * 1024 * 1024) return flash(`File is over ${MAX_DIGITAL_MB} MB — zip it or compress it first`, 'error')
    setFileUploading(true)
    try {
      const path = await uploadFile(file, 'digital-products', { auth: true })
      setP(prev => ({ ...prev, digital_file_path: path, digital_file_name: file.name }))
    } catch (err) { flash(err.message, 'error') } finally { setFileUploading(false) }
  }

  const pricedGroup = !isDigital && (p.option_groups || []).find(g => g.ownPrices)
  const pricedFrom = pricedGroup ? Math.min(...pricedGroup.choices.map(c => Number(c.price)).filter(v => v > 0)) : null

  const save = async () => {
    // Point at the exact field — it's usually scrolled out of view by the options.
    const missing = (id, msg) => {
      const el = document.getElementById(id)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.focus({ preventScroll: true })
      flash(msg, 'error')
    }
    if (!p.name.trim()) return missing('product-name', 'Add a product name (top of the form)')
    // When a group's choices carry the prices, the cheapest becomes the product price.
    let base = Number(p.price)
    let groups = p.option_groups || []
    const priced = !isDigital && groups.find(g => g.ownPrices)
    if (priced) {
      const named = priced.choices.filter(c => String(c.label).trim())
      if (!named.length || named.some(c => !(Number(c.price) > 0))) return missing('option-prices', `Give every ${priced.name || 'option'} choice a price`)
      base = Math.min(...named.map(c => Number(c.price)))
      groups = groups.map(g => g !== priced ? g : { name: g.name, choices: g.choices.map(c => ({ label: c.label, price: round2(Number(c.price) - base) })) })
    }
    if (!(base > 0)) return missing('product-price', `Add the ${p.sell_digital && !isDigital ? 'physical ' : ''}price (above), or tick “Each choice has its own price” on an option`)
    if (p.sell_digital && !isDigital && !(Number(p.digital_price) > 0)) return flash('Add the digital price', 'error')
    if (hasFile && !p.digital_file_path && p.active) return flash('Upload the download file, or untick "Visible in shop" to save a draft', 'error')
    setBusy(true)
    const row = {
      kind: isDigital ? 'digital' : 'physical',
      collection: p.collection || null,
      series: p.series?.trim() || null,
      badge: p.badge || null,
      digital_file_path: hasFile ? p.digital_file_path : null,
      digital_file_name: hasFile ? p.digital_file_name : null,
      digital_price: !isDigital && p.sell_digital ? round2(p.digital_price) : null,
      stock: !isDigital && String(p.stock).trim() !== '' ? Math.max(0, parseInt(p.stock, 10) || 0) : null,
      name: p.name.trim(), description: p.description?.trim() || null, price: round2(base),
      // Options live in option_groups now; the old flat list is cleared once a product is saved.
      option_groups: isDigital ? [] : optionGroups({ option_groups: groups }),
      options: [],
      image_urls: p.image_urls || [], bulk_pricing_enabled: p.bulk_pricing_enabled, active: p.active,
      sort_order: parseInt(p.sort_order, 10) || 0,
    }
    const write = (r) => p.id ? supabase.from('products').update(r).eq('id', p.id) : supabase.from('products').insert(r)
    let { error } = await write(row)
    // Database not updated for options yet (20261024000000_product_option_groups.sql): products
    // without options still save; with options, say exactly what to run.
    if (error && /option_groups/.test(error.message)) {
      if (row.option_groups.length) {
        setBusy(false)
        return flash('Options need a quick database update first: run 20261024000000_product_option_groups.sql in Supabase → SQL Editor.', 'error')
      }
      const { option_groups: _skip, ...rest } = row // eslint-disable-line no-unused-vars
      ;({ error } = await write(rest))
    }
    setBusy(false)
    if (error) return flash(error.message, 'error')
    onSaved(p.id ? 'Product updated' : 'Product added')
  }

  const remove = async () => {
    if (!confirm(`Delete "${p.name}"? Past orders keep their details.`)) return
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) return flash(error.message, 'error')
    onSaved('Product deleted')
  }

  return (
    <Modal title={p.id ? 'Edit product' : isDigital ? 'New digital product' : p.collection === STICKER_BAR.collection ? 'New sticker sheet' : 'New physical product'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {p.id && <ShareLink product={p} flash={flash} />}
        <div style={styles.toggle}>
          {[['physical', '📦 Physical'], ['digital', '⬇️ Digital download']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setP(prev => ({ ...prev, kind: k }))}
              style={{ ...styles.toggleBtn, ...(p.kind === k ? styles.toggleOn : {}) }}>{label}</button>
          ))}
        </div>
        <div>
          <div style={ui.label}>{isDigital ? 'Preview images' : 'Photos'}</div>
          <PhotoManager urls={p.image_urls || []} setUploading={setUploading} flash={flash}
            update={fn => setP(prev => ({ ...prev, image_urls: fn(prev.image_urls || []) }))} />
        </div>
        <ImageStudio p={p} setP={setP} flash={flash} />
        <ListingAssistant p={p} setP={setP} flash={flash} />
        <Field label="Name"><Input id="product-name" value={p.name} onChange={set('name')} /></Field>
        <Field label="Collection">
          <Select value={p.collection || ''} onChange={set('collection')}
            options={[{ value: '', label: 'No collection' }, ...COLLECTIONS.map(c => ({ value: c.key, label: c.name }))]} />
        </Field>
        <div style={ui.row}>
          <Field label="Series (optional)" hint={p.collection === STICKER_BAR.collection ? 'e.g. Journal, Block Party, Book Lover' : null}>
            <Input list="series-list" value={p.series} onChange={set('series')} />
            <datalist id="series-list">{seriesList.map(s => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="Badge">
            <Select value={p.badge} onChange={set('badge')} options={[{ value: '', label: 'None' }, ...STICKER_BAR.badges]} />
          </Field>
        </div>
        <div style={ui.row}>
          {pricedGroup ? (
            <Field label={p.sell_digital ? 'Physical price' : 'Price'}>
              <div style={styles.priceFrom}>From {pricedGroup.name || 'option'} choices{pricedFrom ? ` · from ${fmt(pricedFrom)}` : ''}</div>
            </Field>
          ) : (
            <Field label={isDigital ? 'Price ($)' : p.sell_digital ? 'Physical price ($)' : 'Price ($)'}><Input id="product-price" type="number" step="0.01" min="0" inputMode="decimal" value={p.price} onChange={set('price')} /></Field>
          )}
          {!isDigital && <Field label="Stock on hand" hint="Blank = don’t track"><Input type="number" min={0} value={p.stock} onChange={set('stock')} /></Field>}
          <Field label="Sort order"><Input type="number" value={p.sort_order} onChange={set('sort_order')} /></Field>
        </div>
        <Field label="Description"><TextArea rows={3} value={p.description || ''} onChange={set('description')} /></Field>
        {!isDigital && (
          <label style={{ ...styles.check, ...styles.aiBox, padding: '12px 14px' }}>
            <input type="checkbox" checked={p.sell_digital} onChange={set('sell_digital')} />
            <span><strong>Also sell as a digital download</strong><br /><span style={ui.hint}>Customers pick digital or physical on the product page — great for sticker sheets.</span></span>
          </label>
        )}
        {!isDigital && p.sell_digital && (
          <Field label="Digital price ($)"><Input type="number" step="0.01" value={p.digital_price} onChange={set('digital_price')} /></Field>
        )}
        {hasFile && (
          <div>
            <div style={ui.label}>Download file</div>
            <label style={{ ...styles.fileDrop, opacity: fileUploading ? 0.6 : 1 }}>
              <input type="file" onChange={onDigitalFile} disabled={fileUploading} style={{ display: 'none' }} />
              {fileUploading ? 'Uploading…'
                : p.digital_file_name ? <><strong>{p.digital_file_name}</strong><span style={ui.muted}> · tap to replace</span></>
                : '+ Upload the file buyers will download'}
            </label>
            <div style={ui.hint}>
              PDF, ZIP, PNG, SVG, cut files (DXF, Studio3), Procreate, fonts… up to {MAX_DIGITAL_MB} MB. For multiple files, upload a ZIP.
              Stored privately — buyers only get an expiring link after they pay.
            </div>
          </div>
        )}
        {!isDigital && (
          <OptionGroupsEditor groups={p.option_groups || []} onChange={groups => setP(prev => ({ ...prev, option_groups: groups }))} />
        )}
        <label style={styles.check}><input type="checkbox" checked={p.bulk_pricing_enabled} onChange={set('bulk_pricing_enabled')} /> Counts toward Stack & Save</label>
        <label style={styles.check}><input type="checkbox" checked={p.active} onChange={set('active')} /> Visible in shop</label>
        <Button block loading={busy} disabled={uploading || fileUploading} onClick={save}>Save product</Button>
        {p.id && <Button block variant="danger" onClick={remove}>Delete product</Button>}
      </div>
    </Modal>
  )
}

// ── Claude: draft the listing copy from photos + quick notes ────────────────
function ListingAssistant({ p, setP, flash }) {
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const write = async () => {
    setBusy(true)
    try {
      const r = await api('write-listing', {
        auth: true,
        body: { name: p.name, notes, collection: p.collection, kind: p.kind, price: p.price, imageUrls: p.image_urls || [] },
      })
      setP(prev => ({
        ...prev,
        name: r.title || prev.name,
        description: r.description || prev.description,
        ...(prev.kind !== 'digital' && r.options?.length && !(prev.option_groups || []).length
          ? { option_groups: [{ name: 'Option', choices: r.options.map(label => choice(label)) }] } : {}),
      }))
      setResult(r)
      flash('Listing drafted — review and edit before saving ✨')
    } catch (e) { flash(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <div style={styles.aiBox}>
      <div style={{ ...ui.eyebrow, marginBottom: 6 }}>✨ Write the listing with Claude</div>
      <TextArea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
        placeholder={p.kind === 'digital'
          ? 'What is it? e.g. "12 blush floral digital papers, 12x12 JPG at 300dpi, commercial use OK, great for scrapbooking & sublimation"'
          : 'What is it? e.g. "3D printed name keychain, PLA silk, any name up to 10 letters, 5 colors, about 3 inches wide"'} />
      <div style={{ ...ui.hint, margin: '6px 0 10px' }}>Claude reads your notes and photos, writes the title, description and options in the studio’s voice, and suggests a price. It only states facts you give it.</div>
      <Button small variant="gradient" loading={busy} onClick={write}>{busy ? 'Writing…' : p.description ? 'Rewrite with Claude' : 'Write with Claude'}</Button>
      {result && (
        <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6 }}>
          {result.suggestedPrice != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>Suggested price: <strong>{fmt(result.suggestedPrice)}</strong></span>
              <Button small variant="ghost" onClick={() => setP(prev => ({ ...prev, price: result.suggestedPrice }))}>Use it</Button>
            </div>
          )}
          {result.priceNote && <div style={ui.muted}>{result.priceNote}</div>}
          {result.missingInfo?.length > 0 && (
            <div style={{ marginTop: 8, color: 'var(--warning)' }}>
              <strong>Add to the description if you can:</strong> {result.missingInfo.join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Gemini: restage her real product photo as listing images ────────────────
const IMAGE_STYLES = [
  ['studio', 'Clean studio'], ['lifestyle', 'Lifestyle'], ['flatlay', 'Flat lay'],
  ['gift', 'Gift-ready'], ['vendor', 'Vendor table'], ['mockup', 'Print mockup'],
]

function ImageStudio({ p, setP, flash }) {
  const photos = p.image_urls || []
  const [source, setSource] = useState(null)
  const [style, setStyle] = useState(p.kind === 'digital' ? 'mockup' : 'studio')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState([])
  const src = source && photos.includes(source) ? source : photos[0] || null

  const generate = async () => {
    setBusy(true)
    // Two variations per click; each call returns one saved image.
    const calls = [0, 1].map(() => api('generate-listing-image', {
      auth: true,
      body: { sourceImageUrl: src, style, productName: p.name, notes: p.description?.slice(0, 300) },
    }))
    const settled = await Promise.allSettled(calls)
    const urls = settled.filter(r => r.status === 'fulfilled').map(r => r.value.url)
    const failed = settled.find(r => r.status === 'rejected')
    setResults(prev => [...urls, ...prev])
    if (!urls.length && failed) flash(failed.reason.message, 'error')
    setBusy(false)
  }

  const add = (url) => {
    setP(prev => ({ ...prev, image_urls: [...(prev.image_urls || []), url] }))
    setResults(prev => prev.filter(u => u !== url))
  }

  return (
    <div style={styles.aiBox}>
      <div style={{ ...ui.eyebrow, marginBottom: 6 }}>🎨 Create listing photos with Gemini</div>
      {photos.length > 0 ? (
        <>
          <div style={ui.hint}>Start from your photo — Gemini keeps the product as-is and restyles the scene. Tap the photo to use:</div>
          <div style={{ display: 'flex', gap: 6, margin: '8px 0', flexWrap: 'wrap' }}>
            {photos.map(u => (
              <img key={u} src={u} alt="" onClick={() => setSource(u)}
                style={{ ...styles.thumbSm, outline: u === src ? '3px solid var(--primary)' : 'none' }} />
            ))}
          </div>
        </>
      ) : (
        <div style={{ ...ui.hint, marginBottom: 8, color: 'var(--warning)' }}>
          {p.kind === 'digital'
            ? 'Upload a preview of the design first for the most accurate mockups (or fill in the name/description to generate from scratch).'
            : 'Upload a real photo first — images made from scratch won’t look exactly like what customers receive.'}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {IMAGE_STYLES.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setStyle(k)} style={{ ...styles.chip, ...(style === k ? styles.chipOn : {}) }}>{label}</button>
        ))}
      </div>
      <Button small variant="gradient" loading={busy} disabled={!src && !p.name && !p.description} onClick={generate}>
        {busy ? 'Creating… (~20 sec)' : 'Create 2 photos'}
      </Button>
      {results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginTop: 12 }}>
          {results.map(u => (
            <div key={u} style={{ position: 'relative' }}>
              <a href={u} target="_blank" rel="noreferrer"><img src={u} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, display: 'block' }} /></a>
              <Button small onClick={() => add(u)} style={{ position: 'absolute', bottom: 6, left: 6, right: 6, padding: '6px 8px' }}>+ Add</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const BLANK_CODE = { code: '', discount_type: 'percent', discount_value: '', min_order: '', max_uses: '', expires_at: '' }
const codeForm = (c) => ({
  code: c.code, discount_type: c.discount_type, discount_value: c.discount_value ?? '', min_order: c.min_order ?? '',
  max_uses: c.max_uses ?? '', expires_at: c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-CA') : '',
})

function DiscountCodes({ codes, reload, flash }) {
  const [n, setN] = useState(BLANK_CODE)
  const [editing, setEditing] = useState(null) // code id being edited, or null for a new code
  const set = (k) => (e) => setN(p => ({ ...p, [k]: e.target.value }))

  const save = async () => {
    if (!n.code.trim() || !(Number(n.discount_value) > 0)) return flash('Code and value are required', 'error')
    const row = {
      code: n.code.trim().toUpperCase(), discount_type: n.discount_type, discount_value: Number(n.discount_value),
      min_order: Number(n.min_order) > 0 ? round2(n.min_order) : null,
      max_uses: n.max_uses ? parseInt(n.max_uses, 10) : null, expires_at: n.expires_at ? new Date(n.expires_at + 'T23:59:59').toISOString() : null,
    }
    const { error } = editing
      ? await supabase.from('discount_codes').update(row).eq('id', editing)
      : await supabase.from('discount_codes').insert(row)
    if (error) {
      return flash(/min_order/.test(error.message)
        ? 'Minimum order needs a quick database update — run 20261025000000_refunds_and_code_minimums.sql in Supabase'
        : error.message, 'error')
    }
    flash(editing ? 'Code updated' : 'Code created')
    setN(BLANK_CODE); setEditing(null); reload()
  }

  const toggle = async (c) => {
    const { error } = await supabase.from('discount_codes').update({ active: !c.active }).eq('id', c.id)
    if (error) flash(error.message, 'error'); else reload()
  }

  return (
    <section style={ui.card}>
      <h2 style={ui.h2}>Discount codes</h2>
      {(codes || []).map(c => (
        <div key={c.id} style={{ ...styles.codeRow, ...(editing === c.id ? { background: 'var(--card2)', margin: '0 -10px', padding: '10px' } : {}) }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 15, opacity: c.active ? 1 : 0.5 }}>{c.code}</div>
            <div style={ui.muted}>
              {c.discount_type === 'percent' ? `${c.discount_value}% off` : `${fmt(c.discount_value)} off`}
              {Number(c.min_order) > 0 ? ` · orders ${fmt(c.min_order)}+` : ''} · used {c.uses || 0}{c.max_uses ? `/${c.max_uses}` : ''}
              {c.expires_at ? ` · ends ${new Date(c.expires_at).toLocaleDateString()}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <Button small variant="ghost" onClick={() => { setEditing(c.id); setN(codeForm(c)) }}>Edit</Button>
            <Button small variant={c.active ? 'ghost' : 'secondary'} onClick={() => toggle(c)}>{c.active ? 'Disable' : 'Enable'}</Button>
          </div>
        </div>
      ))}
      <div style={{ ...ui.eyebrow, marginTop: 16 }}>{editing ? `Editing ${n.code || 'code'}` : 'New code'}</div>
      <div style={{ ...ui.row, marginTop: 8 }}>
        <Field label="Code"><Input value={n.code} onChange={set('code')} placeholder="STICKY10" /></Field>
        <Field label="Type"><Select value={n.discount_type} onChange={set('discount_type')} options={[{ value: 'percent', label: '% off' }, { value: 'fixed', label: '$ off' }]} /></Field>
        <Field label="Value"><Input type="number" value={n.discount_value} onChange={set('discount_value')} /></Field>
      </div>
      <div style={{ ...ui.row, marginTop: 10 }}>
        <Field label="Minimum order $ (optional)" hint="Cart total after Stack & Save, before shipping"><Input type="number" step="0.01" min="0" inputMode="decimal" value={n.min_order} onChange={set('min_order')} placeholder="No minimum" /></Field>
        <Field label="Max uses (optional)"><Input type="number" value={n.max_uses} onChange={set('max_uses')} /></Field>
        <Field label="Expires (optional)"><Input type="date" value={n.expires_at} onChange={set('expires_at')} /></Field>
      </div>
      <div style={{ ...ui.row, marginTop: 12 }}>
        <Button small onClick={save}>{editing ? 'Save changes' : 'Create code'}</Button>
        {editing && <Button small variant="ghost" onClick={() => { setEditing(null); setN(BLANK_CODE) }}>Cancel</Button>}
      </div>
    </section>
  )
}

const styles = {
  priceFrom: { ...ui.input, background: 'var(--card2)', color: 'var(--mid)', fontSize: 14, display: 'flex', alignItems: 'center' },
  shareRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--border)' },
  optGroup: { background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 12, padding: 10, marginBottom: 8 },
  optRemove: { background: 'none', border: 'none', color: 'var(--danger)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 },
  optAdd: { background: 'none', border: 'none', color: 'var(--secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '8px 0 0' },
  photo: { position: 'relative', width: 84, height: 84, borderRadius: 12, overflow: 'hidden', background: 'var(--card2)', cursor: 'pointer', flexShrink: 0 },
  cover: { position: 'absolute', left: 4, bottom: 4, background: 'var(--primary)', color: '#fff', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', borderRadius: 6, padding: '2px 6px' },
  photoNum: { position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' },
  photoBar: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8, padding: '8px 10px', borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--border)' },
  groupHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, margin: '4px 2px 8px' },
  count: { fontFamily: "'Montserrat', Arial, sans-serif", fontSize: 12, fontWeight: 700, color: 'var(--muted)', background: 'var(--card2)', borderRadius: 10, padding: '2px 8px', verticalAlign: 'middle' },
  groupAdd: { background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: 'var(--secondary)', cursor: 'pointer', padding: 4 },
  emptyGroup: { ...ui.card, padding: '14px 16px', color: 'var(--muted)', fontSize: 13 },
  list: { ...ui.card, padding: 0, overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer', width: '100%', font: 'inherit', color: 'inherit', background: 'none', border: 'none', borderBottom: '1px solid var(--border)' },
  rowName: { fontWeight: 700, fontSize: 14.5, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' },
  chipTag: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' },
  useTemplate: { background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--secondary)', cursor: 'pointer', textDecoration: 'underline' },
  thumb: { width: 56, height: 56, borderRadius: 10, objectFit: 'cover', background: 'var(--card2)', flexShrink: 0 },
  x: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'var(--dark)', color: '#fff', cursor: 'pointer' },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  toggle: { display: 'flex', background: 'var(--card2)', borderRadius: 50, padding: 4, gap: 4 },
  toggleBtn: { flex: 1, padding: '10px 12px', borderRadius: 50, border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--mid)' },
  toggleOn: { background: '#fff', color: 'var(--dark)', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' },
  fileDrop: { display: 'block', textAlign: 'center', padding: 18, borderRadius: 12, border: '2px dashed var(--border)', background: 'var(--card2)', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--secondary)', wordBreak: 'break-all' },
  aiBox: { background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 },
  thumbSm: { width: 52, height: 52, borderRadius: 8, objectFit: 'cover', cursor: 'pointer' },
  chip: { padding: '6px 11px', borderRadius: 50, border: '1.5px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--mid)' },
  chipOn: { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' },
  codeRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' },
}
