import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BRAND, PRODUCT_TYPES, STICKER_BAR } from '../brand'
import { api, uploadFile } from '../lib/api'
import { ui, Button, Field, Input, TextArea, Select, BrandHeader, Spinner } from '../components/ui'

const BLANK = {
  productType: '', quantity: 1, size: '', finish: '',
  description: '', needBy: '', fulfillment: 'pickup',
  street: '', street2: '', city: '', state: '', zip: '',
  eventType: STICKER_BAR.eventTypes[0], startTime: '', duration: STICKER_BAR.durations[1], venue: '', eventAddress: '',
  customerName: '', customerEmail: '', customerPhone: '', notes: '',
}

const MAX_FILE_MB = 25

export default function OrderForm() {
  // /?type=sticker-bar opens the form with the Sticker Bar booking preselected (handy for her socials/Payhip).
  const [params] = useSearchParams()
  const [f, setF] = useState(() => params.get('type') === 'sticker-bar' ? { ...BLANK, productType: STICKER_BAR.label, quantity: 20 } : BLANK)
  const [files, setFiles] = useState([]) // [{ id, name, url, status: 'uploading'|'done'|'error', error }]
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [doneId, setDoneId] = useState(null)

  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }))
  const uploading = files.some(x => x.status === 'uploading')
  const isEvent = f.productType === STICKER_BAR.label

  const onFiles = async (e) => {
    const picked = [...e.target.files]
    e.target.value = ''
    for (const file of picked) {
      const id = `${Date.now()}-${Math.random()}`
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setFiles(prev => [...prev, { id, name: file.name, status: 'error', error: `Over ${MAX_FILE_MB} MB` }])
        continue
      }
      setFiles(prev => [...prev, { id, name: file.name, status: 'uploading', preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null }])
      try {
        const url = await uploadFile(file, 'order-files')
        setFiles(prev => prev.map(x => x.id === id ? { ...x, url, status: 'done' } : x))
      } catch (err) {
        setFiles(prev => prev.map(x => x.id === id ? { ...x, status: 'error', error: err.message } : x))
      }
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.productType) { setError('Pick what you would like us to make.'); return }
    if (uploading) { setError('Hang on — your files are still uploading.'); return }
    setSubmitting(true)
    try {
      const { orderId } = await api('create-order', {
        body: {
          customerName: f.customerName,
          customerEmail: f.customerEmail,
          customerPhone: f.customerPhone,
          productType: f.productType,
          quantity: f.quantity,
          size: isEvent ? null : f.size,
          finish: isEvent ? null : f.finish,
          eventDetails: isEvent ? { eventType: f.eventType, startTime: f.startTime, duration: f.duration, venue: f.venue, address: f.eventAddress } : null,
          description: f.description,
          needBy: f.needBy,
          notes: f.notes,
          fulfillment: isEvent ? 'event' : f.fulfillment,
          shippingAddress: { street: f.street, street2: f.street2, city: f.city, state: f.state, zip: f.zip },
          imageUrls: files.filter(x => x.status === 'done').map(x => x.url),
        },
      })
      setDoneId(orderId)
      window.scrollTo(0, 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (doneId) {
    return (
      <div style={ui.page}>
        <BrandHeader />
        <div style={{ ...ui.wrap, maxWidth: 520 }}>
          <div style={{ ...ui.card, textAlign: 'center', padding: '36px 24px' }}>
            <div style={{ fontSize: 46, marginBottom: 8 }}>🎉</div>
            <h1 style={ui.h1}>Request received!</h1>
            <p style={{ color: 'var(--mid)', margin: '12px 0 22px', lineHeight: 1.6 }}>
              Thanks, {f.customerName.split(' ')[0]}! We emailed a copy to <strong>{f.customerEmail}</strong>.
              You'll get your quote by email soon.{isEvent && ' Your date is reserved once the deposit is paid.'}
            </p>
            <Button variant="ghost" onClick={() => { setF(BLANK); setFiles([]); setDoneId(null) }}>Submit another request</Button>
          </div>
        </div>
      </div>
    )
  }

  const minDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  return (
    <div style={ui.page}>
      <BrandHeader subtitle={BRAND.subTagline} />
      <form onSubmit={submit} style={{ ...ui.wrap, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <h1 style={ui.h1}>Custom creations made <span style={{ color: 'var(--primary)' }}>with purpose.</span></h1>
          <p style={{ ...ui.muted, marginTop: 8, lineHeight: 1.7 }}>
            Tell us what you're dreaming up and we'll send a personalized quote. Looking for something ready-made?{' '}
            <Link to="/shop/products">Shop the collections</Link>.
          </p>
        </div>

        <section style={ui.card}>
          <div style={ui.eyebrow}>Step 1</div>
          <h2 style={ui.h2}>What are we making?</h2>
          <div style={styles.chips}>
            {PRODUCT_TYPES.map(t => (
              <button type="button" key={t} onClick={() => setF(p => ({ ...p, productType: t, ...(t === STICKER_BAR.label && p.quantity < 5 ? { quantity: 20 } : {}) }))}
                style={{ ...styles.chip, ...(f.productType === t ? styles.chipOn : {}) }}>
                {t}
              </button>
            ))}
          </div>

          {isEvent ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              <p style={{ ...ui.muted, lineHeight: 1.6 }}>{STICKER_BAR.blurb}</p>
              <div style={ui.row}>
                <Field label="Event date">
                  <Input type="date" min={minDate} value={f.needBy} onChange={set('needBy')} required />
                </Field>
                <Field label="Start time">
                  <Input type="time" value={f.startTime} onChange={set('startTime')} />
                </Field>
              </div>
              <div style={ui.row}>
                <Field label="How long?"><Select value={f.duration} onChange={set('duration')} options={STICKER_BAR.durations} /></Field>
                <Field label="Expected guests" style={{ maxWidth: 150 }}>
                  <Input type="number" min={1} inputMode="numeric" value={f.quantity} onChange={set('quantity')} required />
                </Field>
              </div>
              <Field label="Type of event"><Select value={f.eventType} onChange={set('eventType')} options={STICKER_BAR.eventTypes} /></Field>
              <Field label="Venue name (optional)"><Input value={f.venue} onChange={set('venue')} placeholder="e.g. Grace Fellowship Hall" /></Field>
              <Field label="Event address or city" hint="So we can plan travel and setup.">
                <Input value={f.eventAddress} onChange={set('eventAddress')} required />
              </Field>
            </div>
          ) : (
            <>
          <div style={{ ...ui.row, marginTop: 16 }}>
            <Field label="Quantity" style={{ maxWidth: 130 }}>
              <Input type="number" min={1} inputMode="numeric" value={f.quantity} onChange={set('quantity')} required />
            </Field>
            <Field label="Size or dimensions (optional)">
              <Input placeholder='e.g. 11 oz mug, adult L, 4" tall' value={f.size} onChange={set('size')} />
            </Field>
          </div>
          <Field label="Colors, material or finish (optional)" style={{ marginTop: 12 }}>
            <Input placeholder="e.g. blush pink & gold, matte, PLA silk" value={f.finish} onChange={set('finish')} />
          </Field>
            </>
          )}

          <Field label={isEvent ? 'Theme & sticker ideas' : "Describe what you'd like"} style={{ marginTop: 12 }}
            hint={isEvent
              ? 'Party theme, colors, names or logos to include, ages of guests — and anything about the space (tables, power, indoor/outdoor).'
              : "Names, dates, text, colors, the occasion, who it's for — anything that helps us bring it to life."}>
            <TextArea value={f.description} onChange={set('description')} required />
          </Field>
        </section>

        <section style={ui.card}>
          <div style={ui.eyebrow}>Step 2</div>
          <h2 style={ui.h2}>Artwork & files</h2>
          <p style={{ ...ui.muted, marginBottom: 12 }}>Logos, photos, names, sketches, inspiration pics. PNG, JPG, PDF, SVG, AI, EPS, PSD or ZIP — up to {MAX_FILE_MB} MB each.</p>
          <label style={styles.drop}>
            <input type="file" multiple onChange={onFiles} style={{ display: 'none' }}
              accept="image/*,.pdf,.svg,.ai,.eps,.psd,.zip" />
            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>+ Add files</span>
          </label>
          {files.length > 0 && (
            <div style={styles.fileGrid}>
              {files.map(x => (
                <div key={x.id} style={styles.fileTile}>
                  {x.preview
                    ? <img src={x.preview} alt="" style={styles.thumb} />
                    : <div style={{ ...styles.thumb, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{x.name.split('.').pop().toUpperCase()}</div>}
                  <div style={styles.fileName}>{x.name}</div>
                  <div style={{ fontSize: 11, color: x.status === 'error' ? 'var(--danger)' : 'var(--muted)' }}>
                    {x.status === 'uploading' ? <Spinner size={12} /> : x.status === 'error' ? x.error : 'Uploaded ✓'}
                  </div>
                  <button type="button" onClick={() => setFiles(prev => prev.filter(y => y.id !== x.id))} style={styles.remove} aria-label="Remove">×</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {!isEvent && (
        <section style={ui.card}>
          <div style={ui.eyebrow}>Step 3</div>
          <h2 style={ui.h2}>Timing & delivery</h2>
          <Field label="Need it by (optional)" hint="Have an event or gift date? Let us know so we can plan around it.">
            <Input type="date" min={minDate} value={f.needBy} onChange={set('needBy')} />
          </Field>

          <>
              <div style={{ ...styles.toggle, marginTop: 14 }}>
                {[['pickup', BRAND.pickupLabel], ['shipping', 'Ship it to me']].map(([k, label]) => (
                  <button type="button" key={k} onClick={() => setF(p => ({ ...p, fulfillment: k }))}
                    style={{ ...styles.toggleBtn, ...(f.fulfillment === k ? styles.toggleOn : {}) }}>
                    {label}
                  </button>
                ))}
              </div>
              {f.fulfillment === 'shipping' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                  <Field label="Street address"><Input autoComplete="address-line1" value={f.street} onChange={set('street')} required /></Field>
                  <Field label="Apt / suite (optional)"><Input autoComplete="address-line2" value={f.street2} onChange={set('street2')} /></Field>
                  <div style={ui.row}>
                    <Field label="City" style={{ flex: 2 }}><Input autoComplete="address-level2" value={f.city} onChange={set('city')} required /></Field>
                    <Field label="State" style={{ minWidth: 80 }}><Input autoComplete="address-level1" maxLength={2} placeholder="TX" value={f.state} onChange={e => setF(p => ({ ...p, state: e.target.value.toUpperCase() }))} required /></Field>
                    <Field label="ZIP" style={{ minWidth: 100 }}><Input autoComplete="postal-code" inputMode="numeric" value={f.zip} onChange={set('zip')} pattern="\d{5}(-\d{4})?" required /></Field>
                  </div>
                  <div style={ui.hint}>Shipping is added to your quote.</div>
                </div>
              )}
          </>
        </section>
        )}

        <section style={ui.card}>
          <div style={ui.eyebrow}>{isEvent ? 'Step 3' : 'Step 4'}</div>
          <h2 style={ui.h2}>Your info</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Full name"><Input autoComplete="name" value={f.customerName} onChange={set('customerName')} required /></Field>
            <div style={ui.row}>
              <Field label="Email"><Input type="email" autoComplete="email" value={f.customerEmail} onChange={set('customerEmail')} required /></Field>
              <Field label="Phone (optional)"><Input type="tel" autoComplete="tel" value={f.customerPhone} onChange={set('customerPhone')} /></Field>
            </div>
            <Field label="Anything else? (optional)"><TextArea rows={3} value={f.notes} onChange={set('notes')} /></Field>
          </div>
        </section>

        {error && <div style={ui.error}>{error}</div>}
        <Button type="submit" variant="gradient" block loading={submitting} disabled={uploading} style={{ padding: 17, fontSize: 16 }}>
          {uploading ? 'Uploading files…' : isEvent ? 'Request my Sticker Bar →' : 'Send my request →'}
        </Button>
        <p style={{ ...ui.muted, textAlign: 'center', fontSize: 12 }}>No payment now — you'll review and approve a quote first.</p>
      </form>
    </div>
  )
}

const styles = {
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: {
    padding: '10px 14px', borderRadius: 50, border: '1.5px solid var(--border)', background: '#fff',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--mid)',
  },
  chipOn: { borderColor: 'var(--primary)', background: 'var(--primary)', color: '#fff' },
  drop: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22, borderRadius: 14,
    border: '2px dashed var(--border)', background: 'var(--card2)', cursor: 'pointer',
  },
  fileGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginTop: 12 },
  fileTile: { position: 'relative', border: '1px solid var(--border)', borderRadius: 12, padding: 8, background: '#fff' },
  thumb: { width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, background: 'var(--card2)', marginBottom: 6 },
  fileName: { fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  remove: {
    position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', border: 'none',
    background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', lineHeight: '20px', fontSize: 15,
  },
  toggle: { display: 'flex', background: 'var(--card2)', borderRadius: 50, padding: 4, gap: 4 },
  toggleBtn: { flex: 1, padding: '10px 12px', borderRadius: 50, border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--mid)' },
  toggleOn: { background: '#fff', color: 'var(--dark)', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' },
}
