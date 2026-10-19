import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { api, uploadFile, APP_URL } from '../lib/api'
import { fmt, round2 } from '../lib/money'
import { COLLECTIONS } from '../brand'
import Nav from '../components/Nav'
import { ui, Button, Field, Input, TextArea, Select, Loading, Modal, useFlash, Badge } from '../components/ui'

const BLANK = { kind: 'physical', collection: '', name: '', description: '', price: '', options: '', image_urls: [], digital_file_path: null, digital_file_name: null, bulk_pricing_enabled: true, active: true, sort_order: 0 }
const BLANK_DIGITAL = { ...BLANK, kind: 'digital', collection: 'paper-studio', bulk_pricing_enabled: false }
const MAX_DIGITAL_MB = 50 // matches the digital-products bucket limit in supabase/schema.sql

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
          <div style={{ display: 'flex', gap: 8 }}>
            <Button small variant="ghost" onClick={() => setEditing(BLANK_DIGITAL)}>+ Digital</Button>
            <Button small onClick={() => setEditing(BLANK)}>+ Physical</Button>
          </div>
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
                <div style={ui.muted}>
                  {fmt(p.price)}
                  {p.collection && ` · ${COLLECTIONS.find(c => c.key === p.collection)?.name || p.collection}`}
                  {p.kind === 'digital' ? ` · ${p.digital_file_name || 'no file uploaded'}` : p.options?.length ? ` · ${p.options.length} options` : ''}
                </div>
              </div>
              {p.kind === 'digital' && <Badge color="var(--primary)" bg="var(--card2)">Digital</Badge>}
              {p.kind === 'digital' && !p.digital_file_path && <Badge color="var(--danger)" bg="rgba(220,38,38,0.08)">Needs file</Badge>}
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
  const [fileUploading, setFileUploading] = useState(false)
  const isDigital = p.kind === 'digital'
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

  const save = async () => {
    if (!p.name.trim() || !(Number(p.price) > 0)) return flash('Name and price are required', 'error')
    if (isDigital && !p.digital_file_path && p.active) return flash('Upload the download file, or untick "Visible in shop" to save a draft', 'error')
    setBusy(true)
    const row = {
      kind: isDigital ? 'digital' : 'physical',
      collection: p.collection || null,
      digital_file_path: isDigital ? p.digital_file_path : null,
      digital_file_name: isDigital ? p.digital_file_name : null,
      name: p.name.trim(), description: p.description?.trim() || null, price: round2(p.price),
      options: isDigital ? [] : String(p.options || '').split(',').map(s => s.trim()).filter(Boolean),
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
    <Modal title={p.id ? 'Edit product' : isDigital ? 'New digital product' : 'New physical product'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={styles.toggle}>
          {[['physical', '📦 Physical'], ['digital', '⬇️ Digital download']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setP(prev => ({ ...prev, kind: k }))}
              style={{ ...styles.toggleBtn, ...(p.kind === k ? styles.toggleOn : {}) }}>{label}</button>
          ))}
        </div>
        <div>
          <div style={ui.label}>{isDigital ? 'Preview images' : 'Photos'}</div>
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
        <ImageStudio p={p} setP={setP} flash={flash} />
        <ListingAssistant p={p} setP={setP} flash={flash} />
        <Field label="Name"><Input value={p.name} onChange={set('name')} /></Field>
        <Field label="Collection">
          <Select value={p.collection || ''} onChange={set('collection')}
            options={[{ value: '', label: 'No collection' }, ...COLLECTIONS.map(c => ({ value: c.key, label: c.name }))]} />
        </Field>
        <div style={ui.row}>
          <Field label="Price ($)"><Input type="number" step="0.01" value={p.price} onChange={set('price')} /></Field>
          <Field label="Sort order"><Input type="number" value={p.sort_order} onChange={set('sort_order')} /></Field>
        </div>
        <Field label="Description"><TextArea rows={3} value={p.description || ''} onChange={set('description')} /></Field>
        {isDigital ? (
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
        ) : (
          <Field label="Options (comma separated)" hint='e.g. Matte, Glossy, Holographic — leave blank for none'>
            <Input value={p.options} onChange={set('options')} />
          </Field>
        )}
        <label style={styles.check}><input type="checkbox" checked={p.bulk_pricing_enabled} onChange={set('bulk_pricing_enabled')} /> Counts toward bulk discounts</label>
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
        ...(prev.kind !== 'digital' && r.options?.length ? { options: r.options.join(', ') } : {}),
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
