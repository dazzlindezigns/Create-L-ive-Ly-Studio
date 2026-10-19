import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { fmt, round2 } from '../lib/money'
import { BRAND } from '../brand'
import Nav from '../components/Nav'
import { ui, Button, Field, Input, TextArea, Select, useFlash } from '../components/ui'

const SAVE_KEY = 'calculator-draft-v1'
const blankItem = () => ({ id: crypto.randomUUID(), name: '', qty: 1, laborPerUnit: 0, supplyLines: [{ description: '', qty: 1, unitCost: 0 }], reasoning: '' })

// Supply line qty is the TOTAL for the whole batch (see api estimate prompt) — never multiply by item.qty.
const itemCost = (it) => {
  const supplies = it.supplyLines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0)
  const labor = (Number(it.laborPerUnit) || 0) * (Number(it.qty) || 0)
  return { supplies, labor, total: supplies + labor }
}
// Round unit prices up to the nearest 5¢ so quotes look clean.
const unitPriceFor = (it, markup) => {
  const qty = Number(it.qty) || 1
  return Math.ceil((itemCost(it).total / qty) * (1 + markup / 100) * 20) / 20
}

// Downscale images before sending to the AI (keeps requests small and fast).
async function toBase64Image(file) {
  const img = await createImageBitmap(file)
  const scale = Math.min(1, 1568 / Math.max(img.width, img.height))
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) })
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { base64: dataUrl.split(',')[1], mediaType: 'image/jpeg', preview: dataUrl }
}

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) } catch { return null }
}

export default function Calculator() {
  const navigate = useNavigate()
  const draft = loadDraft()
  const [description, setDescription] = useState(draft?.description || '')
  const [images, setImages] = useState([])
  const [items, setItems] = useState(draft?.items?.length ? draft.items : [blankItem()])
  const [markup, setMarkup] = useState(draft?.markup ?? 60)
  const [cust, setCust] = useState(draft?.cust || { name: '', email: '', phone: '', title: '', depositType: 'percent', depositAmount: 50, turnaround: '', note: '' })
  const [estimating, setEstimating] = useState(false)
  const [creating, setCreating] = useState(false)
  const [toast, flash] = useFlash()

  useEffect(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ description, items, markup, cust })) } catch {}
  }, [description, items, markup, cust])

  const setItem = (id, patch) => setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
  const setSupply = (id, idx, patch) => setItems(prev => prev.map(it => it.id === id
    ? { ...it, supplyLines: it.supplyLines.map((l, i) => i === idx ? { ...l, ...patch } : l) } : it))

  const onImages = async (e) => {
    const files = [...e.target.files].slice(0, 4 - images.length)
    e.target.value = ''
    try { setImages([...images, ...(await Promise.all(files.map(toBase64Image)))]) }
    catch { flash('Could not read that image', 'error') }
  }

  const estimate = async () => {
    if (!description.trim() && !images.length) return flash('Describe the job or add a photo', 'error')
    setEstimating(true)
    try {
      const r = await api('estimate-from-description', {
        auth: true,
        body: { description, mode: 'quote', images: images.map(({ base64, mediaType }) => ({ base64, mediaType })) },
      })
      setItems(r.items.map(it => ({ ...it, id: crypto.randomUUID() })))
      if (!cust.title && r.items[0]?.name) setCust(c => ({ ...c, title: r.items.length > 1 ? `${r.items[0].name} + more` : r.items[0].name }))
      flash('Estimate ready — review and adjust ✨')
    } catch (e) { flash(e.message, 'error') } finally { setEstimating(false) }
  }

  const rows = items.map(it => {
    const cost = itemCost(it)
    const unit = unitPriceFor(it, markup)
    return { it, cost, unit, price: round2(unit * (Number(it.qty) || 0)) }
  })
  const totalCost = rows.reduce((s, r) => s + r.cost.total, 0)
  const totalPrice = rows.reduce((s, r) => s + r.price, 0)
  const profit = totalPrice - totalCost

  const invoiceLines = rows.filter(r => r.it.name && r.it.qty > 0).map(r => ({ description: r.it.name, qty: Number(r.it.qty), unitPrice: r.unit }))

  const create = async (send) => {
    if (!invoiceLines.length) return flash('Add at least one item with a name', 'error')
    setCreating(true)
    try {
      const { orderId } = await api('create-invoice', {
        auth: true,
        body: {
          customerName: cust.name, customerEmail: cust.email, customerPhone: cust.phone, title: cust.title,
          depositType: cust.depositType, depositAmount: cust.depositAmount, turnaround: cust.turnaround, note: cust.note,
          lines: invoiceLines,
          internal: { markup, items: items.map(({ id, ...rest }) => rest), totalCost: round2(totalCost) },
        },
      })
      if (send) await api('send-quote', { auth: true, body: { orderId } })
      localStorage.removeItem(SAVE_KEY)
      navigate(`/dashboard/order/${orderId}`)
    } catch (e) { flash(e.message, 'error'); setCreating(false) }
  }

  const reset = () => {
    if (!confirm('Clear the calculator?')) return
    setDescription(''); setImages([]); setItems([blankItem()])
    setCust({ name: '', email: '', phone: '', title: '', depositType: 'percent', depositAmount: 50, turnaround: '', note: '' })
  }

  return (
    <div style={ui.page} className="admin-page">
      <div style={{ ...ui.wrap, maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <header className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={ui.eyebrow}>Pricing</div>
            <h1 style={ui.h1}>Calculator</h1>
          </div>
          <Button small variant="ghost" onClick={reset}>Clear</Button>
        </header>

        {/* AI estimate */}
        <section style={ui.card} className="no-print">
          <h2 style={ui.h2}>✨ AI estimate</h2>
          <TextArea rows={3} value={description} onChange={e => setDescription(e.target.value)}
            placeholder='e.g. "12 personalized 3D printed keychains with names" or "Sticker Bar for 30 guests at a baby shower, 2 hours"' />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            {images.map((img, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={img.preview} alt="" style={styles.thumb} />
                <button onClick={() => setImages(images.filter((_, j) => j !== i))} style={styles.x}>×</button>
              </div>
            ))}
            {images.length < 4 && (
              <label style={{ ...styles.thumb, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)', cursor: 'pointer', color: 'var(--muted)', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>
                <input type="file" accept="image/*" multiple onChange={onImages} style={{ display: 'none' }} />+ Photo
              </label>
            )}
            <Button variant="gradient" loading={estimating} onClick={estimate} style={{ marginLeft: 'auto' }}>
              {estimating ? 'Thinking…' : 'Estimate'}
            </Button>
          </div>
        </section>

        {/* Items */}
        {rows.map(({ it, cost, unit, price }) => (
          <section key={it.id} style={ui.card} className="no-print">
            <div style={ui.row}>
              <Field label="Item" style={{ flex: 3 }}><Input value={it.name} onChange={e => setItem(it.id, { name: e.target.value })} /></Field>
              <Field label="Qty" style={{ minWidth: 80 }}><Input type="number" min={0} value={it.qty} onChange={e => setItem(it.id, { qty: e.target.value })} /></Field>
            </div>
            {it.reasoning && <div style={{ ...ui.hint, marginTop: 6 }}>🤖 {it.reasoning}</div>}

            <div style={{ ...ui.label, marginTop: 12 }}>Supplies <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(qty = total for the whole batch)</span></div>
            {it.supplyLines.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <Input style={{ flex: 3, padding: '9px 10px', fontSize: 14 }} placeholder="Material" value={l.description} onChange={e => setSupply(it.id, i, { description: e.target.value })} />
                <Input style={{ flex: 1, padding: '9px 10px', fontSize: 14, minWidth: 54 }} type="number" placeholder="Qty" value={l.qty} onChange={e => setSupply(it.id, i, { qty: e.target.value })} />
                <Input style={{ flex: 1, padding: '9px 10px', fontSize: 14, minWidth: 64 }} type="number" step="0.01" placeholder="$ each" value={l.unitCost} onChange={e => setSupply(it.id, i, { unitCost: e.target.value })} />
                <button onClick={() => setItem(it.id, { supplyLines: it.supplyLines.filter((_, j) => j !== i) })} style={styles.del} aria-label="Remove">×</button>
              </div>
            ))}
            <button onClick={() => setItem(it.id, { supplyLines: [...it.supplyLines, { description: '', qty: 1, unitCost: 0 }] })} style={styles.add}>+ Supply</button>

            <Field label="Labor per unit ($)" style={{ marginTop: 10, maxWidth: 200 }}>
              <Input type="number" step="0.01" value={it.laborPerUnit} onChange={e => setItem(it.id, { laborPerUnit: e.target.value })} />
            </Field>

            <div style={styles.itemSummary}>
              <span>Cost {fmt(cost.total)} ({fmt(cost.supplies)} supplies + {fmt(cost.labor)} labor)</span>
              <strong>{fmt(unit)} ea · {fmt(price)}</strong>
            </div>
            {items.length > 1 && <button onClick={() => setItems(items.filter(x => x.id !== it.id))} style={{ ...styles.add, color: 'var(--danger)' }}>Remove item</button>}
          </section>
        ))}
        <Button variant="ghost" className="no-print" onClick={() => setItems([...items, blankItem()])}>+ Add item</Button>

        {/* Totals */}
        <section style={ui.card} className="no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Field label={`Markup: ${markup}%`} style={{ flex: 1 }}>
              <input type="range" min={0} max={300} step={5} value={markup} onChange={e => setMarkup(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--primary)' }} />
            </Field>
          </div>
          <div style={styles.totals}>
            <Stat label="Cost" value={fmt(totalCost)} />
            <Stat label="Price" value={fmt(totalPrice)} big />
            <Stat label="Profit" value={fmt(profit)} color={profit >= 0 ? 'var(--success)' : 'var(--danger)'} />
            <Stat label="Margin" value={totalPrice ? `${Math.round(profit / totalPrice * 100)}%` : '—'} />
          </div>
        </section>

        {/* Invoice */}
        <section style={ui.card} className="no-print">
          <h2 style={ui.h2}>Quote / invoice</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Title"><Input value={cust.title} onChange={e => setCust({ ...cust, title: e.target.value })} placeholder="e.g. Custom mugs for Bloom Bakery" /></Field>
            <Field label="Customer name"><Input value={cust.name} onChange={e => setCust({ ...cust, name: e.target.value })} /></Field>
            <div style={ui.row}>
              <Field label="Email"><Input type="email" value={cust.email} onChange={e => setCust({ ...cust, email: e.target.value })} /></Field>
              <Field label="Phone"><Input value={cust.phone} onChange={e => setCust({ ...cust, phone: e.target.value })} /></Field>
            </div>
            <div style={ui.row}>
              <Field label="Deposit"><Select value={cust.depositType} onChange={e => setCust({ ...cust, depositType: e.target.value })} options={[{ value: 'percent', label: '% deposit' }, { value: 'fixed', label: '$ deposit' }, { value: 'full', label: 'Pay in full' }]} /></Field>
              {cust.depositType !== 'full' && <Field label={cust.depositType === 'percent' ? '%' : '$'}><Input type="number" value={cust.depositAmount} onChange={e => setCust({ ...cust, depositAmount: e.target.value })} /></Field>}
            </div>
            <Field label="Turnaround"><Input value={cust.turnaround} onChange={e => setCust({ ...cust, turnaround: e.target.value })} /></Field>
            <Field label="Note to customer"><TextArea rows={2} value={cust.note} onChange={e => setCust({ ...cust, note: e.target.value })} /></Field>
            <div style={ui.row}>
              <Button loading={creating} onClick={() => create(true)}>Create & email</Button>
              <Button variant="ghost" disabled={creating} onClick={() => create(false)}>Create only</Button>
              <Button variant="ghost" onClick={() => window.print()}>Print / PDF</Button>
            </div>
          </div>
        </section>

        {/* Print-only invoice */}
        <PrintInvoice cust={cust} lines={invoiceLines} total={totalPrice} />
      </div>
      {toast}
      <Nav />
    </div>
  )
}

function PrintInvoice({ cust, lines, total }) {
  return (
    <div className="print-only" style={{ display: 'none' }}>
      <style>{'@media print { .print-only { display: block !important; } }'}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <img src={BRAND.logo} alt={BRAND.name} style={{ width: 200, height: 'auto', display: 'block' }} />
          <div style={{ color: '#777', fontSize: 12, marginTop: 6 }}>{BRAND.location} · {window.location.host}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>INVOICE</div>
          <div style={{ color: '#777', fontSize: 13 }}>{new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</div>
        </div>
      </div>
      <div style={{ marginBottom: 20, fontSize: 14 }}>
        <div style={{ color: '#777', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Bill to</div>
        <div style={{ fontWeight: 700 }}>{cust.name}</div>
        <div>{cust.email}</div>
        {cust.phone && <div>{cust.phone}</div>}
      </div>
      {cust.title && <div style={{ fontWeight: 700, marginBottom: 10 }}>{cust.title}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead><tr style={{ borderBottom: '2px solid #222', textAlign: 'left' }}><th style={{ padding: 6 }}>Item</th><th style={{ padding: 6, textAlign: 'right' }}>Qty</th><th style={{ padding: 6, textAlign: 'right' }}>Unit</th><th style={{ padding: 6, textAlign: 'right' }}>Amount</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: 6 }}>{l.description}</td>
              <td style={{ padding: 6, textAlign: 'right' }}>{l.qty}</td>
              <td style={{ padding: 6, textAlign: 'right' }}>{fmt(l.unitPrice)}</td>
              <td style={{ padding: 6, textAlign: 'right' }}>{fmt(l.qty * l.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: 'right', fontSize: 20, fontWeight: 800, marginTop: 16 }}>Total {fmt(total)}</div>
      {cust.turnaround && <p style={{ marginTop: 16, fontSize: 13 }}>Turnaround: {cust.turnaround}</p>}
      {cust.note && <p style={{ marginTop: 8, fontSize: 13, whiteSpace: 'pre-wrap' }}>{cust.note}</p>}
    </div>
  )
}

const Stat = ({ label, value, big, color }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: big ? 24 : 17, fontWeight: 800, color: color || 'var(--dark)' }}>{value}</div>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
  </div>
)

const styles = {
  thumb: { width: 56, height: 56, borderRadius: 10, objectFit: 'cover' },
  x: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--dark)', color: '#fff', cursor: 'pointer', fontSize: 13 },
  del: { width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'var(--card2)', cursor: 'pointer', color: 'var(--muted)', flexShrink: 0 },
  add: { background: 'none', border: 'none', color: 'var(--secondary)', fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: '4px 0' },
  itemSummary: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 12, padding: '10px 12px', background: 'var(--card2)', borderRadius: 10, fontSize: 13 },
  totals: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, alignItems: 'end' },
}
