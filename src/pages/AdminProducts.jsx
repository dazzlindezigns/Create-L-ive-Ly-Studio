import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { api, uploadFile, APP_URL } from '../lib/api'
import { fmt, round2 } from '../lib/money'
import Nav from '../components/Nav'
import { ui, Button, Field, Input, TextArea, Select, Loading, Modal, useFlash, Badge } from '../components/ui'

const BLANK = { name: '', description: '', price: '', options: '', image_urls: [], bulk_pricing_enabled: true, active: true, sort_order: 0 }

export default function AdminProducts() {
  const [products, setProducts] = useState(null)
  const [codes, setCodes] = useState(null)
  const [settings, setSettings] = useState({})
  const [editing, setEditing] = useState(null)
  const [toast, flash] = useFlash()

  const load = async () => {
    const [{ data: p }, { data: c }, s] = await Promise.all([
      supabase.from('products').select('*').order('sort_order').order('created_at'),
      supabase.from('discount_codes').select('*').order('created_at', { ascending: false }),
      api('get-settings').catch(() => ({})),
    ])
    setProducts(p || []); setCodes(c || []); setSettings(s)
  }
  useEffect(() => { load() }, [])

  const saveSetting = async (key, value) => {
    try { await api('save-settings', { body: { key, value }, auth: true }); setSettings(s => ({ ...s, [key]: value })); flash('Saved') }
    catch (e) { flash(e.message, 'error') }
  }

  if (!products) return <div style={ui.page}><Loading /><Nav /></div>

  return (
    <div style={ui.page}>
      <div style={{ ...ui.wrap, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={ui.eyebrow}>Shop</div>
            <h1 style={ui.h1}>Products</h1>
          </div>
          <Button small onClick={() => setEditing(BLANK)}>+ Product</Button>
        </header>

        <div style={{ ...ui.card, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--mid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{APP_URL}/shop/products</span>
          <Button small variant="ghost" onClick={() => navigator.clipboard.writeText(`${APP_URL}/shop/products`).then(() => flash('Shop link copied'))}>Copy</Button>
        </div>

        {products.length === 0 && <div style={{ ...ui.card, textAlign: 'center', color: 'var(--muted)' }}>No products yet. Add your first one!</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {products.map(p => (
            <button key={p.id} onClick={() => setEditing({ ...p, options: (p.options || []).join(', ') })} style={{ ...ui.card, ...styles.row }}>
              {p.image_urls?.[0] ? <img src={p.image_urls[0]} alt="" style={styles.thumb} /> : <div style={{ ...styles.thumb, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✨</div>}
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={ui.muted}>{fmt(p.price)}{p.options?.length ? ` · ${p.options.length} options` : ''}</div>
              </div>
              {!p.active && <Badge color="#888" bg="rgba(0,0,0,0.06)">Hidden</Badge>}
            </button>
          ))}
        </div>

        <DiscountCodes codes={codes} reload={load} flash={flash} />

        <section style={ui.card}>
          <h2 style={ui.h2}>Shop settings</h2>
          <SettingField label="Flat shipping fee ($)" type="number" value={settings.shop_shipping_fee ?? 0} onSave={v => saveSetting('shop_shipping_fee', Number(v) || 0)} />
          <SettingField label="Message when shop is closed" value={settings.shop_closed_message || ''} onSave={v => saveSetting('shop_closed_message', v)} />
          <SettingField label="In-person payment instructions (shown on quotes)" value={settings.in_person_payment_note || ''} onSave={v => saveSetting('in_person_payment_note', v)} />
          <p style={ui.hint}>Open/close the shop from the Orders dashboard.</p>
        </section>
      </div>

      {editing && <ProductModal product={editing} onClose={() => setEditing(null)} onSaved={(msg) => { setEditing(null); flash(msg); load() }} flash={flash} />}
      {toast}
      <Nav />
    </div>
  )
}

function SettingField({ label, value, onSave, type = 'text' }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
      <Field label={label}><Input type={type} value={v} onChange={e => setV(e.target.value)} /></Field>
      {String(v) !== String(value) && <Button small onClick={() => onSave(v)}>Save</Button>}
    </div>
  )
}

function ProductModal({ product, onClose, onSaved, flash }) {
  const [p, setP] = useState(product)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const set = (k) => (e) => setP(prev => ({ ...prev, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const onFiles = async (e) => {
    const files = [...e.target.files]
    e.target.value = ''
    setUploading(true)
    try {
      for (const f of files) {
        const url = await uploadFile(f, 'product-images', { auth: true })
        setP(prev => ({ ...prev, image_urls: [...(prev.image_urls || []), url] }))
      }
    } catch (err) { flash(err.message, 'error') } finally { setUploading(false) }
  }

  const save = async () => {
    if (!p.name.trim() || !(Number(p.price) > 0)) return flash('Name and price are required', 'error')
    setBusy(true)
    const row = {
      name: p.name.trim(), description: p.description?.trim() || null, price: round2(p.price),
      options: String(p.options || '').split(',').map(s => s.trim()).filter(Boolean),
      image_urls: p.image_urls || [], bulk_pricing_enabled: p.bulk_pricing_enabled, active: p.active,
      sort_order: parseInt(p.sort_order, 10) || 0,
    }
    const { error } = p.id ? await supabase.from('products').update(row).eq('id', p.id) : await supabase.from('products').insert(row)
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
    <Modal title={p.id ? 'Edit product' : 'New product'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Name"><Input value={p.name} onChange={set('name')} /></Field>
        <div style={ui.row}>
          <Field label="Price ($)"><Input type="number" step="0.01" value={p.price} onChange={set('price')} /></Field>
          <Field label="Sort order"><Input type="number" value={p.sort_order} onChange={set('sort_order')} /></Field>
        </div>
        <Field label="Description"><TextArea rows={3} value={p.description || ''} onChange={set('description')} /></Field>
        <Field label="Options (comma separated)" hint='e.g. Matte, Glossy, Holographic — leave blank for none'>
          <Input value={p.options} onChange={set('options')} />
        </Field>
        <div>
          <div style={ui.label}>Photos</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(p.image_urls || []).map(u => (
              <div key={u} style={{ position: 'relative' }}>
                <img src={u} alt="" style={styles.thumb} />
                <button onClick={() => setP(prev => ({ ...prev, image_urls: prev.image_urls.filter(x => x !== u) }))} style={styles.x}>×</button>
              </div>
            ))}
            <label style={{ ...styles.thumb, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px dashed var(--border)', fontSize: 22, color: 'var(--muted)' }}>
              <input type="file" accept="image/*" multiple onChange={onFiles} style={{ display: 'none' }} />
              {uploading ? '…' : '+'}
            </label>
          </div>
        </div>
        <label style={styles.check}><input type="checkbox" checked={p.bulk_pricing_enabled} onChange={set('bulk_pricing_enabled')} /> Counts toward bulk discounts</label>
        <label style={styles.check}><input type="checkbox" checked={p.active} onChange={set('active')} /> Visible in shop</label>
        <Button block loading={busy} disabled={uploading} onClick={save}>Save product</Button>
        {p.id && <Button block variant="danger" onClick={remove}>Delete product</Button>}
      </div>
    </Modal>
  )
}

function DiscountCodes({ codes, reload, flash }) {
  const [n, setN] = useState({ code: '', discount_type: 'percent', discount_value: '', max_uses: '', expires_at: '' })
  const set = (k) => (e) => setN(p => ({ ...p, [k]: e.target.value }))

  const add = async () => {
    if (!n.code.trim() || !(Number(n.discount_value) > 0)) return flash('Code and value are required', 'error')
    const { error } = await supabase.from('discount_codes').insert({
      code: n.code.trim().toUpperCase(), discount_type: n.discount_type, discount_value: Number(n.discount_value),
      max_uses: n.max_uses ? parseInt(n.max_uses, 10) : null, expires_at: n.expires_at ? new Date(n.expires_at + 'T23:59:59').toISOString() : null,
    })
    if (error) return flash(error.message, 'error')
    setN({ code: '', discount_type: 'percent', discount_value: '', max_uses: '', expires_at: '' })
    flash('Code created'); reload()
  }

  const toggle = async (c) => {
    const { error } = await supabase.from('discount_codes').update({ active: !c.active }).eq('id', c.id)
    if (error) flash(error.message, 'error'); else reload()
  }

  return (
    <section style={ui.card}>
      <h2 style={ui.h2}>Discount codes</h2>
      {(codes || []).map(c => (
        <div key={c.id} style={styles.codeRow}>
          <div>
            <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 15 }}>{c.code}</div>
            <div style={ui.muted}>
              {c.discount_type === 'percent' ? `${c.discount_value}% off` : `${fmt(c.discount_value)} off`} · used {c.uses || 0}{c.max_uses ? `/${c.max_uses}` : ''}
              {c.expires_at ? ` · ends ${new Date(c.expires_at).toLocaleDateString()}` : ''}
            </div>
          </div>
          <Button small variant={c.active ? 'ghost' : 'secondary'} onClick={() => toggle(c)}>{c.active ? 'Disable' : 'Enable'}</Button>
        </div>
      ))}
      <div style={{ ...ui.row, marginTop: 14 }}>
        <Field label="Code"><Input value={n.code} onChange={set('code')} placeholder="STICKY10" /></Field>
        <Field label="Type"><Select value={n.discount_type} onChange={set('discount_type')} options={[{ value: 'percent', label: '% off' }, { value: 'fixed', label: '$ off' }]} /></Field>
        <Field label="Value"><Input type="number" value={n.discount_value} onChange={set('discount_value')} /></Field>
      </div>
      <div style={{ ...ui.row, marginTop: 10 }}>
        <Field label="Max uses (optional)"><Input type="number" value={n.max_uses} onChange={set('max_uses')} /></Field>
        <Field label="Expires (optional)"><Input type="date" value={n.expires_at} onChange={set('expires_at')} /></Field>
      </div>
      <Button small onClick={add} style={{ marginTop: 12 }}>Create code</Button>
    </section>
  )
}

const styles = {
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: 12, cursor: 'pointer', width: '100%', font: 'inherit', color: 'inherit' },
  thumb: { width: 64, height: 64, borderRadius: 10, objectFit: 'cover', background: 'var(--card2)', flexShrink: 0 },
  x: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'var(--dark)', color: '#fff', cursor: 'pointer' },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  codeRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' },
}
