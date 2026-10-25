import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { uploadFile, APP_URL } from '../lib/api'
import { cleanAmazonUrl } from '../lib/finds'
import { FINDS } from '../brand'
import { ui, Button, Field, Input, TextArea, Select } from './ui'

const BLANK = { title: '', note: '', url: '', image_url: '', shelf: FINDS.shelves[0].key, badge: '', featured: false, pairs_with: '', active: true }

// Shop → Finds: her Amazon favorites for /finds. A list with taps per pick, and a form to add/edit one.
export default function FindsManager({ products, flash }) {
  const [finds, setFinds] = useState(null)
  const [missing, setMissing] = useState(false)
  const [form, setForm] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('finds').select('*').order('sort_order').order('created_at', { ascending: false })
    if (error) { setMissing(true); setFinds([]) } else setFinds(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const move = async (i, dir) => {
    const list = [...finds]
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    setFinds(list)
    await Promise.all(list.map((f, k) => supabase.from('finds').update({ sort_order: k }).eq('id', f.id)))
  }

  if (!finds) return <div style={ui.muted}>Loading…</div>
  if (missing) return <div style={ui.error}>Finds need a quick database update — run <strong>20261029000000_amazon_finds.sql</strong> in the Supabase SQL Editor, then reopen this.</div>
  if (form) return <FindForm find={form} products={products} flash={flash} onClose={() => setForm(null)} onSaved={(msg) => { setForm(null); flash(msg); load() }} />

  return (
    <div>
      <p style={{ ...ui.muted, marginBottom: 10 }}>Your Amazon favorites, shown at <a href={`${APP_URL}/finds`} target="_blank" rel="noreferrer">/finds</a> and on your homepage. Your own photo and a line about why you love it is what makes people tap.</p>
      <Button small onClick={() => setForm({ ...BLANK })}>+ Add a find</Button>
      {finds.length === 0 && <p style={{ ...ui.muted, marginTop: 12 }}>No finds yet.</p>}
      {finds.map((f, i) => (
        <div key={f.id} style={{ ...styles.row, opacity: f.active ? 1 : 0.55 }}>
          {f.image_url ? <img src={f.image_url} alt="" style={styles.thumb} /> : <div style={{ ...styles.thumb, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🛍️</div>}
          <button onClick={() => setForm({ ...BLANK, ...f, pairs_with: f.pairs_with || '' })} style={styles.rowBtn}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{f.featured && '⭐ '}{f.title}</div>
            <div style={ui.muted}>{FINDS.shelves.find(s => s.key === f.shelf)?.name || 'No shelf'} · {f.clicks || 0} tap{f.clicks === 1 ? '' : 's'}{!f.active && ' · Hidden'}</div>
          </button>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => move(i, -1)} disabled={i === 0} style={styles.arrow} aria-label="Move up">▲</button>
            <button onClick={() => move(i, 1)} disabled={i === finds.length - 1} style={styles.arrow} aria-label="Move down">▼</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function FindForm({ find, products, flash, onClose, onSaved }) {
  const [f, setF] = useState(find)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const onPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try { const url = await uploadFile(file, 'product-images', { auth: true }); setF(p => ({ ...p, image_url: url })) }
    catch (err) { flash(err.message, 'error') } finally { setUploading(false) }
  }

  const save = async () => {
    const url = cleanAmazonUrl(f.url)
    if (!url) return flash('Paste the Amazon link (amazon.com, amzn.to or a.co)', 'error')
    if (!f.title.trim()) return flash('Give it a name', 'error')
    setBusy(true)
    const row = {
      title: f.title.trim().slice(0, 120), note: f.note.trim().slice(0, 400) || null, url,
      image_url: f.image_url || null, shelf: f.shelf || null, badge: f.badge || null,
      featured: f.featured, pairs_with: f.pairs_with || null, active: f.active,
    }
    // Only one featured pick at a time.
    if (row.featured) await supabase.from('finds').update({ featured: false }).neq('id', f.id || '00000000-0000-0000-0000-000000000000')
    const { error } = f.id
      ? await supabase.from('finds').update(row).eq('id', f.id)
      : await supabase.from('finds').insert({ ...row, sort_order: -Math.floor(Date.now() / 1000) }) // newest first
    setBusy(false)
    if (error) return flash(error.message, 'error')
    onSaved(f.id ? 'Find updated' : 'Find added 🛍️')
  }

  const remove = async () => {
    if (!confirm(`Delete “${f.title}”?`)) return
    const { error } = await supabase.from('finds').delete().eq('id', f.id)
    if (error) return flash(error.message, 'error')
    onSaved('Find deleted')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={ui.eyebrow}>{f.id ? 'Edit find' : 'New find'}</div>
      <Field label="Amazon link" hint="From your Amazon storefront or SiteStripe — your tag stays on it.">
        <Input value={f.url} onChange={set('url')} placeholder="https://amzn.to/…" autoFocus={!f.id} />
      </Field>
      <Field label="Name"><Input value={f.title} onChange={set('title')} placeholder="e.g. My go-to heat press pillow" /></Field>
      <div>
        <div style={ui.label}>Your photo</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {f.image_url ? <img src={f.image_url} alt="" style={{ ...styles.thumb, width: 84, height: 84 }} /> : <div style={{ ...styles.thumb, width: 84, height: 84 }} />}
          <label style={styles.upload}>
            <input type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} />
            {uploading ? 'Uploading…' : f.image_url ? 'Change photo' : '+ Add photo'}
          </label>
        </div>
        <div style={ui.hint}>Use a photo you took of it (on your table, in your booth, in use). It’s what makes it feel like yours.</div>
      </div>
      <Field label="Why you love it" hint="One or two lines, in your voice — shown in quotes with your name.">
        <TextArea rows={3} value={f.note} onChange={set('note')} placeholder="I’ve gone through three of these — it’s the reason my sticker edges are so clean." />
      </Field>
      <div style={ui.row}>
        <Field label="Shelf"><Select value={f.shelf} onChange={set('shelf')} options={FINDS.shelves.map(s => ({ value: s.key, label: s.name }))} /></Field>
        <Field label="Badge"><Select value={f.badge} onChange={set('badge')} options={[{ value: '', label: 'None' }, ...FINDS.badges]} /></Field>
      </div>
      <Field label="I use this to make… (optional)" hint="Links shoppers to your product, so finds lead back to your shop.">
        <Select value={f.pairs_with} onChange={set('pairs_with')} options={[{ value: '', label: 'Nothing linked' }, ...products.filter(p => p.active).map(p => ({ value: p.id, label: p.name }))]} />
      </Field>
      <label style={styles.check}><input type="checkbox" checked={f.featured} onChange={set('featured')} /> Feature it at the top (“If you only get one thing”)</label>
      <label style={styles.check}><input type="checkbox" checked={f.active} onChange={set('active')} /> Show on the site</label>
      <div style={ui.row}>
        <Button small loading={busy} disabled={uploading} onClick={save}>{f.id ? 'Save changes' : 'Add find'}</Button>
        <Button small variant="ghost" onClick={onClose}>Cancel</Button>
        {f.id && <Button small variant="danger" onClick={remove}>Delete</Button>}
      </div>
    </div>
  )
}

const styles = {
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' },
  rowBtn: { flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' },
  thumb: { width: 52, height: 52, borderRadius: 10, objectFit: 'cover', background: 'var(--card2)', flexShrink: 0 },
  arrow: { background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, cursor: 'pointer', padding: '2px 6px' },
  upload: { padding: '10px 14px', borderRadius: 12, border: '2px dashed var(--border)', background: 'var(--card2)', cursor: 'pointer', fontWeight: 700, color: 'var(--secondary)', fontSize: 13 },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' },
}
