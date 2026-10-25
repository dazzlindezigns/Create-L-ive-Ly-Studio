import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { api, uploadFile, APP_URL } from '../lib/api'
import { cleanAmazonUrl } from '../lib/finds'
import { FINDS } from '../brand'
import { ui, Button, Field, Input, TextArea, Select } from './ui'
import { TagArt } from '../pages/Finds'

const BLANK = { title: '', note: '', url: '', image_url: '', icon: '', shelf: FINDS.shelves[0].key, badge: '', featured: false, pairs_with: '', active: true }

// Shop → Finds: her Amazon favorites for /finds. A list with taps per pick, and a form to add/edit one.
export default function FindsManager({ products, flash }) {
  const [finds, setFinds] = useState(null)
  const [missing, setMissing] = useState(false)
  const [form, setForm] = useState(null)
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('finds').select('*').order('sort_order').order('created_at', { ascending: false })
    if (error) { setMissing(true); setFinds([]) } else setFinds(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const drafts = (finds || []).filter(f => f.draft)
  const live = (finds || []).filter(f => !f.draft)

  const move = async (i, dir) => {
    const list = [...live]
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    setFinds([...drafts, ...list])
    await Promise.all(list.map((f, k) => supabase.from('finds').update({ sort_order: k }).eq('id', f.id)))
  }

  if (!finds) return <div style={ui.muted}>Loading…</div>
  if (missing) return <div style={ui.error}>Finds need a quick database update — run <strong>20261029000000_amazon_finds.sql</strong> in the Supabase SQL Editor, then reopen this.</div>
  if (importing) return <ImportForm flash={flash} onClose={() => setImporting(false)} onDone={(msg) => { setImporting(false); flash(msg); load() }} />
  if (form) return <FindForm find={form} products={products} flash={flash} onClose={() => setForm(null)} onSaved={(msg) => { setForm(null); flash(msg); load() }} />

  return (
    <div>
      <p style={{ ...ui.muted, marginBottom: 10 }}>Your Amazon favorites, shown at <a href={`${APP_URL}/finds`} target="_blank" rel="noreferrer">/finds</a> and on your homepage. Import your links, tap the line that sounds like you, publish. Photos are optional — finds without one get a designed tag card.</p>
      <div style={{ ...ui.row, gap: 8 }}>
        <Button small variant="gradient" onClick={() => setImporting(true)}>✨ Import my Amazon links</Button>
        <Button small variant="ghost" onClick={() => setForm({ ...BLANK })}>+ Add one</Button>
      </div>
      {drafts.length > 0 && <Drafts drafts={drafts} flash={flash} reload={load} />}
      {live.length === 0 && !drafts.length && <p style={{ ...ui.muted, marginTop: 12 }}>No finds yet — tap Import to bring in your Amazon links.</p>}
      {live.length > 0 && drafts.length > 0 && <div style={{ ...ui.label, marginTop: 18 }}>On your site</div>}
      {live.map((f, i) => (
        <div key={f.id} style={{ ...styles.row, opacity: f.active ? 1 : 0.55 }}>
          {f.image_url ? <img src={f.image_url} alt="" style={styles.thumb} /> : <div style={{ ...styles.thumb, overflow: 'hidden' }}><TagArt f={f} mini /></div>}
          <button onClick={() => setForm({ ...BLANK, ...f, pairs_with: f.pairs_with || '', icon: f.icon || '' })} style={styles.rowBtn}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{f.featured && '⭐ '}{f.title}</div>
            <div style={ui.muted}>{FINDS.shelves.find(s => s.key === f.shelf)?.name || 'No shelf'} · {f.clicks || 0} tap{f.clicks === 1 ? '' : 's'}{!f.active && ' · Hidden'}</div>
          </button>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => move(i, -1)} disabled={i === 0} style={styles.arrow} aria-label="Move up">▲</button>
            <button onClick={() => move(i, 1)} disabled={i === live.length - 1} style={styles.arrow} aria-label="Move down">▼</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// Pull her Amazon links from her Linktree (or pasted links) and let the listing assistant draft them.
function ImportForm({ flash, onClose, onDone }) {
  const [linktree, setLinktree] = useState(FINDS.linktree || '')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(null)
  const run = async (body, which) => {
    setBusy(which)
    try {
      const r = await api('import-finds', { auth: true, body })
      onDone(r.added ? `${r.added} new find${r.added > 1 ? 's' : ''} ready to review ✨` : 'Those links are already in your finds')
    } catch (e) { flash(e.message, 'error'); setBusy(null) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={ui.eyebrow}>Import your Amazon links</div>
      <p style={ui.muted}>The listing assistant names each one and writes a few “why I love it” lines for you to pick from. Nothing goes live until you approve it.</p>
      <Field label="From your Linktree">
        <div style={{ display: 'flex', gap: 8 }}>
          <Input value={linktree} onChange={e => setLinktree(e.target.value)} placeholder="create.live.ly" style={{ flex: 1 }} />
          <Button small loading={busy === 'lt'} disabled={!!busy || !linktree.trim()} onClick={() => run({ linktree }, 'lt')}>Import</Button>
        </div>
      </Field>
      <Field label="Or paste Amazon links (one per line)">
        <TextArea rows={4} value={text} onChange={e => setText(e.target.value)} placeholder={'https://amzn.to/…\nhttps://amzn.to/…'} />
      </Field>
      <div style={ui.row}>
        <Button small loading={busy === 'paste'} disabled={!!busy || !text.trim()} onClick={() => run({ text }, 'paste')}>Import pasted links</Button>
        <Button small variant="ghost" disabled={!!busy} onClick={onClose}>Cancel</Button>
      </div>
      {busy && <div style={ui.hint}>Reading your links and writing names… this takes about 20 seconds.</div>}
    </div>
  )
}

// Imported finds waiting for her OK: pick a line, tweak the name if she wants, publish.
function Drafts({ drafts, flash, reload }) {
  const [edits, setEdits] = useState({})
  const [busy, setBusy] = useState(false)
  const val = (d) => ({ title: d.title, note: d.note || '', shelf: d.shelf, badge: d.badge || '', ...edits[d.id] })
  const set = (id, patch) => setEdits(p => ({ ...p, [id]: { ...p[id], ...patch } }))

  const publish = async (list) => {
    setBusy(true)
    let n = 0
    for (const [k, d] of list.entries()) {
      const v = val(d)
      const { error } = await supabase.from('finds').update({
        title: v.title.trim() || d.title, note: v.note.trim() || null, shelf: v.shelf, badge: v.badge || null,
        draft: false, active: true, sort_order: -Math.floor(Date.now() / 1000) + k,
      }).eq('id', d.id)
      if (error) flash(error.message, 'error'); else n++
    }
    setBusy(false)
    flash(`${n} find${n === 1 ? '' : 's'} published 🛍️`); reload()
  }
  const skip = async (d) => {
    const { error } = await supabase.from('finds').delete().eq('id', d.id)
    if (error) flash(error.message, 'error'); else reload()
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={ui.label}>Review new finds ({drafts.length})</div>
        <Button small loading={busy} onClick={() => publish(drafts)}>Publish all</Button>
      </div>
      {drafts.map(d => {
        const v = val(d)
        return (
          <div key={d.id} style={styles.draft}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ ...styles.thumb, overflow: 'hidden' }}><TagArt f={{ ...d, shelf: v.shelf }} mini /></div>
              <Input value={v.title} onChange={e => set(d.id, { title: e.target.value })} style={{ flex: 1, fontWeight: 700, padding: '9px 10px', fontSize: 14 }} />
            </div>
            {(d.note_options || []).length > 0 && <div style={{ ...ui.hint, marginTop: 8 }}>Tap the line that sounds like you:</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {(d.note_options || []).map((n, k) => (
                <button key={k} onClick={() => set(d.id, { note: n })} style={{ ...styles.noteChip, ...(v.note === n ? styles.noteOn : {}) }}>“{n}”</button>
              ))}
            </div>
            <TextArea rows={2} value={v.note} onChange={e => set(d.id, { note: e.target.value })} placeholder="Or write your own line" style={{ marginTop: 8, fontSize: 14 }} />
            <div style={{ ...ui.row, gap: 8, marginTop: 8 }}>
              <Select value={v.shelf} onChange={e => set(d.id, { shelf: e.target.value })} options={FINDS.shelves.map(x => ({ value: x.key, label: x.name }))} style={{ flex: 1, minWidth: 140, padding: '8px 10px', fontSize: 14 }} />
              <Select value={v.badge} onChange={e => set(d.id, { badge: e.target.value })} options={[{ value: '', label: 'No badge' }, ...FINDS.badges]} style={{ flex: 1, minWidth: 120, padding: '8px 10px', fontSize: 14 }} />
            </div>
            <div style={{ ...ui.row, gap: 8, marginTop: 10 }}>
              <Button small disabled={busy} onClick={() => publish([d])}>✓ Publish</Button>
              <Button small variant="ghost" disabled={busy} onClick={() => skip(d)}>Skip</Button>
              <a href={d.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, alignSelf: 'center' }}>View on Amazon ↗</a>
            </div>
          </div>
        )
      })}
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
      image_url: f.image_url || null, icon: (f.icon || '').trim().slice(0, 8) || null, shelf: f.shelf || null, badge: f.badge || null,
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
      <div style={ui.row}>
        <Field label="Name" style={{ flex: 3 }}><Input value={f.title} onChange={set('title')} placeholder="e.g. My go-to heat press pillow" /></Field>
      </div>
      <div>
        <div style={ui.label}>Your photo</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {f.image_url ? <img src={f.image_url} alt="" style={{ ...styles.thumb, width: 84, height: 84 }} /> : <div style={{ ...styles.thumb, width: 84, height: 84 }} />}
          <label style={styles.upload}>
            <input type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} />
            {uploading ? 'Uploading…' : f.image_url ? 'Change photo' : '+ Add photo'}
          </label>
        </div>
        <div style={ui.hint}>Optional. Without a photo, the find shows a printed-label card with its name.</div>
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
  draft: { padding: 12, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card2)', marginTop: 10 },
  noteChip: { textAlign: 'left', padding: '9px 12px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--card)', fontSize: 13, fontStyle: 'italic', color: 'var(--mid)', cursor: 'pointer', fontFamily: 'inherit' },
  noteOn: { borderColor: 'var(--primary)', color: 'var(--dark)', background: '#fff', boxShadow: '0 0 0 2px var(--primary) inset' },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' },
}
