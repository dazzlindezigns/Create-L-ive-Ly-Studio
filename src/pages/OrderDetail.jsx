import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api, uploadFile, APP_URL } from '../lib/api'
import { fmt, round2, paymentOptions, depositFor } from '../lib/money'
import { STATUS, STATUS_ORDER } from '../lib/status'
import { BRAND, PRODUCT_TYPES } from '../brand'
import Nav from '../components/Nav'
import ShipModal from '../components/ShipModal'
import { ui, Badge, Button, Field, Input, TextArea, Select, Loading, useFlash, Modal } from '../components/ui'

const PRE_PAYMENT = ['pending', 'quote_sent', 'invoice_sent', 'payment_pending']

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [payments, setPayments] = useState([])
  const [notFound, setNotFound] = useState(false)
  const [toast, flash] = useFlash()
  const [shipOpen, setShipOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)

  const load = useCallback(async () => {
    const [{ data, error }, { data: pays }] = await Promise.all([
      supabase.from('orders').select('*').eq('id', id).maybeSingle(),
      supabase.from('payments').select('*').eq('order_id', id).order('created_at', { ascending: false }),
    ])
    if (error || !data) { setNotFound(true); return }
    setOrder(data)
    setPayments(pays || [])
  }, [id])

  useEffect(() => { load() }, [load])

  // Writes straight to Supabase — RLS allows it for admins.
  const update = async (fields, msg = 'Saved') => {
    const { data, error } = await supabase.from('orders').update(fields).eq('id', id).select().single()
    if (error) { flash(error.message, 'error'); return false }
    setOrder(data)
    if (msg) flash(msg)
    return true
  }

  if (notFound) return <div style={ui.page}><Nav back="/dashboard" backLabel="Orders" /><div style={{ ...ui.wrap, textAlign: 'center', paddingTop: 60 }}>Order not found.</div></div>
  if (!order) return <div style={ui.page}><Nav back="/dashboard" backLabel="Orders" /><Loading /></div>

  const firstName = (order.customer_name || '').split(' ')[0] || 'there'
  const copy = (text, msg) => navigator.clipboard.writeText(text).then(() => flash(msg), () => flash('Copy failed', 'error'))

  return (
    <div style={ui.page}>
      <Nav back="/dashboard" backLabel="Orders" />
      <div style={{ ...ui.wrap, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Header */}
        <section style={ui.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={ui.eyebrow}>{order.source === 'shop' ? 'Shop order' : order.source === 'invoice' ? 'Invoice' : 'Custom request'} · #{order.id.slice(0, 8)}</div>
              <h1 style={{ ...ui.h1, fontSize: 24, marginTop: 4 }}>{order.customer_name}</h1>
              <div style={{ ...ui.muted, marginTop: 4 }}>
                <a href={`mailto:${order.customer_email}`}>{order.customer_email}</a>
                {order.customer_phone && <> · <a href={`tel:${order.customer_phone}`}>{order.customer_phone}</a></>}
              </div>
              <div style={{ ...ui.muted, marginTop: 2 }}>Received {new Date(order.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </div>
            <Badge status={order.status} />
          </div>
          <div style={{ ...ui.row, marginTop: 14, alignItems: 'flex-end' }}>
            <Field label="Status">
              <Select value={order.status} onChange={e => update({ status: e.target.value }, `Status → ${STATUS[e.target.value]?.label}`)}
                options={STATUS_ORDER.map(k => ({ value: k, label: STATUS[k].label }))} />
            </Field>
            <Button variant="ghost" small onClick={() => setEditOpen(true)}>Edit details</Button>
          </div>
        </section>

        {/* Admin-only */}
        <AdminOnly order={order} update={update} />

        {/* Request */}
        <section style={ui.card}>
          <h2 style={ui.h2}>Request</h2>
          <dl style={styles.dl}>
            <Row k={order.event_details ? 'Booking' : 'Product'} v={order.event_details ? `${order.product_type} · ${order.quantity} guests` : `${order.product_type} × ${order.quantity}`} />
            <Row k="Size" v={order.size} />
            <Row k="Finish" v={order.finish} />
            <Row k={order.event_details ? 'Event date' : 'Need by'} v={order.need_by && new Date(order.need_by + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} />
            <Row k="Delivery" v={order.fulfillment === 'shipping'
              ? `Ship to ${[order.shipping_address?.street, order.shipping_address?.street2, order.shipping_address?.city].filter(Boolean).join(', ')}, ${order.shipping_address?.state || ''} ${order.shipping_address?.zip || ''}`
              : order.fulfillment === 'digital' ? 'Digital download (nothing to ship)'
              : order.fulfillment === 'event' ? 'On-site Sticker Bar' : BRAND.pickupLabel} />
            {order.event_details && <>
              <Row k="Time" v={[order.event_details.startTime && formatTime(order.event_details.startTime), order.event_details.duration].filter(Boolean).join(' · ')} />
              <Row k="Event" v={order.event_details.eventType} />
              <Row k="Venue" v={order.event_details.venue} />
              <Row k="Address" v={order.event_details.address && (
                <a href={`https://maps.google.com/?q=${encodeURIComponent(order.event_details.address)}`} target="_blank" rel="noreferrer">{order.event_details.address}</a>
              )} />
            </>}
          </dl>
          {order.description && <p style={styles.pre}>{order.description}</p>}
          {order.notes && <><div style={{ ...ui.label, marginTop: 12 }}>Customer notes</div><p style={styles.pre}>{order.notes}</p></>}
          {order.image_urls?.length > 0 && (
            <>
              <div style={{ ...ui.label, marginTop: 12 }}>Customer files</div>
              <FileGrid urls={order.image_urls} />
            </>
          )}
        </section>

        <QuoteSection order={order} payments={payments} update={update} flash={flash} reload={load}
          onCopyLink={() => copy(`${APP_URL}/quote/${order.id}`, 'Quote link copied')}
          onRecordPayment={() => setPayOpen(true)} />

        <ProofSection order={order} update={update} flash={flash} reload={load}
          onCopyMessage={() => copy(
            `Hey ${firstName}! Your proof is ready for review. Tap the link below to approve or request changes — this takes less than a minute!\n\n${APP_URL}/proof/${order.id}\n\n— ${BRAND.ownerFirstName}`,
            'Proof message copied — paste it into a text!',
          )} />

        {(order.shop_cart || []).some(l => l.kind === 'digital') && (
          <DigitalSection order={order} flash={flash} onCopy={() => copy(`${APP_URL}/downloads/${order.id}`, 'Download link copied')} />
        )}

        {/* Fulfillment */}
        {!['digital', 'event'].includes(order.fulfillment) && (
        <section style={ui.card}>
          <h2 style={ui.h2}>{order.fulfillment === 'shipping' ? 'Shipping' : 'Pickup'}</h2>
          {order.tracking_number ? (
            <dl style={styles.dl}>
              <Row k="Carrier" v={order.shipping_carrier} />
              <Row k="Tracking" v={order.tracking_number} />
              <Row k="Shipped" v={order.shipped_at && new Date(order.shipped_at).toLocaleDateString()} />
              {order.shipping_label_url && <Row k="Label" v={<a href={order.shipping_label_url} target="_blank" rel="noreferrer">Reprint label ↗</a>} />}
            </dl>
          ) : <p style={ui.muted}>{order.fulfillment === 'shipping' ? 'Not shipped yet.' : `Customer picks up — ${BRAND.pickupLabel}.`}</p>}
          <div style={{ ...ui.row, marginTop: 12 }}>
            <Button variant="secondary" small onClick={() => setShipOpen(true)}>{order.tracking_number ? 'Update shipping' : 'Ship / buy label'}</Button>
            {order.fulfillment !== 'shipping' && order.status !== 'ready_for_pickup' && (
              <Button variant="ghost" small onClick={() => update({ status: 'ready_for_pickup' }, 'Marked ready for pickup')}>Mark ready for pickup</Button>
            )}
            {order.status !== 'completed' && (
              <Button variant="ghost" small onClick={() => update({ status: 'completed' }, 'Order complete 🎉')}>Mark complete</Button>
            )}
          </div>
        </section>
        )}

        {/* Danger zone */}
        <section style={{ ...ui.card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {!['cancelled', 'declined'].includes(order.status) && (
            <Button variant="danger" small onClick={() => confirm('Cancel this order?') && update({ status: 'cancelled' }, 'Order cancelled')}>Cancel order</Button>
          )}
          <Button variant="danger" small onClick={async () => {
            if (!confirm('Delete this order permanently? This cannot be undone.')) return
            const { error } = await supabase.from('orders').delete().eq('id', id)
            if (error) flash(error.message, 'error'); else navigate('/dashboard')
          }}>Delete</Button>
        </section>
      </div>

      {shipOpen && <ShipModal order={order} onClose={() => setShipOpen(false)} onDone={(msg) => { setShipOpen(false); flash(msg); load() }} />}
      {editOpen && <EditModal order={order} onClose={() => setEditOpen(false)} onSave={async (f) => { if (await update(f, 'Details updated')) setEditOpen(false) }} />}
      {payOpen && <PaymentModal order={order} onClose={() => setPayOpen(false)} onSaved={(msg) => { setPayOpen(false); flash(msg); load() }} flash={flash} />}
      {toast}
    </div>
  )
}

// ── Digital downloads ───────────────────────────────────────────────────────
function DigitalSection({ order, flash, onCopy }) {
  const [sending, setSending] = useState(false)
  const items = order.shop_cart.filter(l => l.kind === 'digital')
  const paidInFull = Number(order.price) > 0 && Number(order.amount_paid) >= Number(order.price) - 0.009
  const resend = async () => {
    setSending(true)
    try { await api('send-downloads', { body: { orderId: order.id }, auth: true }); flash('Download email sent ✉️') }
    catch (e) { flash(e.message, 'error') } finally { setSending(false) }
  }
  return (
    <section style={ui.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={ui.h2}>Digital downloads</h2>
        <span style={ui.muted}>{paidInFull ? `Opened ${order.download_count || 0}×` : 'Locked until paid'}</span>
      </div>
      {items.map((l, i) => (
        <div key={i} style={styles.line}><span>{l.productName}</span><span style={ui.muted}>{l.digitalFileName}</span></div>
      ))}
      <div style={{ ...ui.row, marginTop: 12 }}>
        <Button variant="secondary" small loading={sending} disabled={!paidInFull} onClick={resend}>Email download link</Button>
        <Button variant="ghost" small onClick={onCopy}>Copy download link</Button>
      </div>
      {!paidInFull && <div style={ui.hint}>The link unlocks automatically after a Square payment. If they paid another way, record the payment first, then email the link.</div>}
    </section>
  )
}

// ── Admin-only fields (PO number is NEVER shown to customers) ───────────────
function AdminOnly({ order, update }) {
  const [po, setPo] = useState(order.po_number || '')
  const [notes, setNotes] = useState(order.internal_notes || '')
  const dirty = po !== (order.po_number || '') || notes !== (order.internal_notes || '')
  return (
    <section style={{ ...ui.card, background: 'var(--card2)', border: '1px dashed var(--border)' }}>
      <div style={{ ...ui.eyebrow, color: 'var(--mid)' }}>🔒 Admin only — never shown to customers</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        <Field label="PO number"><Input value={po} onChange={e => setPo(e.target.value)} placeholder="e.g. PO-1042" /></Field>
        <Field label="Internal notes"><TextArea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        {dirty && <Button small onClick={() => update({ po_number: po.trim() || null, internal_notes: notes.trim() || null })}>Save</Button>}
      </div>
    </section>
  )
}

// ── Quote + payments ────────────────────────────────────────────────────────
function QuoteSection({ order, payments, update, flash, reload, onCopyLink, onRecordPayment }) {
  const [q, setQ] = useState({
    price: order.price ?? '',
    deposit_type: order.deposit_type || 'percent',
    deposit_amount: order.deposit_amount ?? 50,
    turnaround: order.turnaround || '',
    quote_note: order.quote_note || '',
    square: (order.payment_methods || ['square']).includes('square'),
    in_person: (order.payment_methods || []).includes('in_person'),
  })
  const [sending, setSending] = useState(false)
  const set = (k) => (e) => setQ(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const fields = () => ({
    price: q.price === '' ? null : round2(q.price),
    deposit_type: q.deposit_type,
    deposit_amount: q.deposit_type === 'full' ? round2(q.price) : Number(q.deposit_amount) || 0,
    turnaround: q.turnaround.trim() || null,
    quote_note: q.quote_note.trim() || null,
    payment_methods: [q.square && 'square', q.in_person && 'in_person'].filter(Boolean),
  })

  const send = async () => {
    if (!(Number(q.price) > 0)) return flash('Enter a price first', 'error')
    setSending(true)
    try {
      if (!(await update(fields(), null))) return
      await api('send-quote', { body: { orderId: order.id }, auth: true })
      flash(order.quote_sent_at ? 'Quote re-sent ✉️' : 'Quote sent ✉️')
      reload()
    } catch (e) { flash(e.message, 'error') } finally { setSending(false) }
  }

  const preview = { ...order, ...fields() }
  const { paid, remaining } = paymentOptions(preview)
  const locked = Number(order.amount_paid) > 0

  return (
    <section style={ui.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={ui.h2}>Quote & payment</h2>
        {order.quote_sent_at && <span style={ui.muted}>Sent {new Date(order.quote_sent_at).toLocaleDateString()}</span>}
      </div>

      {order.quote_breakdown?.lines?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {order.quote_breakdown.lines.map((l, i) => (
            <div key={i} style={styles.line}><span>{l.qty} × {l.description}</span><span>{fmt(l.qty * l.unitPrice)}</span></div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={ui.row}>
          <Field label="Total price ($)" hint={locked ? 'Payments received — edit carefully' : null}>
            <Input type="number" step="0.01" min="0" inputMode="decimal" value={q.price} onChange={set('price')} />
          </Field>
          <Field label="Deposit">
            <Select value={q.deposit_type} onChange={set('deposit_type')} options={[
              { value: 'percent', label: '% deposit' }, { value: 'fixed', label: '$ deposit' }, { value: 'full', label: 'Pay in full' },
            ]} />
          </Field>
          {q.deposit_type !== 'full' && (
            <Field label={q.deposit_type === 'percent' ? 'Deposit %' : 'Deposit $'} hint={`= ${fmt(depositFor(preview))}`}>
              <Input type="number" step="0.01" min="0" value={q.deposit_amount} onChange={set('deposit_amount')} />
            </Field>
          )}
        </div>
        <Field label="Turnaround"><Input placeholder="e.g. 7–10 business days after proof approval" value={q.turnaround} onChange={set('turnaround')} /></Field>
        <Field label="Note to customer"><TextArea rows={3} value={q.quote_note} onChange={set('quote_note')} /></Field>
        <div style={{ ...ui.row, gap: 18 }}>
          <label style={styles.check}><input type="checkbox" checked={q.square} onChange={set('square')} /> Card (Square)</label>
          <label style={styles.check}><input type="checkbox" checked={q.in_person} onChange={set('in_person')} /> In person / cash</label>
        </div>
        <div style={ui.row}>
          <Button variant="ghost" small onClick={() => update(fields())}>Save</Button>
          <Button small loading={sending} onClick={send}>{order.quote_sent_at ? 'Save & re-send quote' : 'Save & send quote'}</Button>
          <Button variant="ghost" small onClick={onCopyLink}>Copy quote link</Button>
        </div>
      </div>

      <div style={ui.divider} />
      <dl style={styles.dl}>
        <Row k="Signed" v={order.terms_agreed_at ? `${order.customer_signature} · ${new Date(order.terms_agreed_at).toLocaleDateString()}` : 'Not yet'} />
        <Row k="Paid" v={`${fmt(paid)} of ${fmt(order.price)}`} />
        <Row k="Balance" v={remaining > 0 ? fmt(remaining) : order.price ? 'Paid in full ✓' : '—'} />
      </dl>
      {payments.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {payments.map(p => (
            <div key={p.id} style={styles.line}>
              <span>{p.kind} · {new Date(p.paid_at || p.created_at).toLocaleDateString()}</span>
              <span style={{ color: p.status === 'paid' ? 'var(--success)' : 'var(--muted)', fontWeight: 600 }}>{fmt(p.amount)} {p.status === 'paid' ? '✓' : '(link opened)'}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <Button variant="ghost" small onClick={onRecordPayment}>Record cash / other payment</Button>
      </div>
    </section>
  )
}

function PaymentModal({ order, onClose, onSaved, flash }) {
  const { remaining } = paymentOptions(order)
  const [amount, setAmount] = useState(remaining || '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const amt = round2(amount)
    if (!(amt > 0)) return flash('Enter an amount', 'error')
    setBusy(true)
    const now = new Date().toISOString()
    const amountPaid = round2((Number(order.amount_paid) || 0) + amt)
    const fields = { amount_paid: amountPaid, deposit_paid: true, deposit_paid_at: order.deposit_paid_at || now }
    if (amountPaid >= round2(order.price)) { fields.balance_paid = true; fields.paid_at = now }
    if (PRE_PAYMENT.includes(order.status)) fields.status = 'confirmed'
    const { error: e1 } = await supabase.from('payments').insert({ order_id: order.id, kind: 'manual', amount: amt, status: 'paid', paid_at: now })
    const { error: e2 } = await supabase.from('orders').update(fields).eq('id', order.id)
    setBusy(false)
    if (e1 || e2) return flash((e1 || e2).message, 'error')
    onSaved(`Recorded ${fmt(amt)}`)
  }
  return (
    <Modal title="Record a payment" onClose={onClose}>
      <p style={{ ...ui.muted, marginBottom: 12 }}>For cash, Zelle, Cash App, etc. — anything paid outside Square.</p>
      <Field label="Amount ($)"><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
      <Button block loading={busy} onClick={save} style={{ marginTop: 14 }}>Record payment</Button>
    </Modal>
  )
}

// ── Proofs ──────────────────────────────────────────────────────────────────
function ProofSection({ order, update, flash, reload, onCopyMessage }) {
  const [items, setItems] = useState(order.proof_items || (order.proof_urls || []).map(url => ({ url, label: '' })))
  const [note, setNote] = useState(order.proof_note || '')
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)

  const onFiles = async (e) => {
    const files = [...e.target.files]
    e.target.value = ''
    setUploading(true)
    try {
      for (const file of files) {
        const url = await uploadFile(file, 'order-proofs', { auth: true })
        setItems(prev => [...prev, { url, label: '' }])
      }
    } catch (err) { flash(err.message, 'error') } finally { setUploading(false) }
  }

  const save = (msg) => update({ proof_items: items, proof_urls: items.map(i => i.url), proof_note: note.trim() || null }, msg)

  const send = async () => {
    if (!items.length) return flash('Upload a proof first', 'error')
    setSending(true)
    try {
      if (!(await save(null))) return
      await api('send-proof', { body: { orderId: order.id }, auth: true })
      flash('Proof emailed ✉️')
      reload()
    } catch (e) { flash(e.message, 'error') } finally { setSending(false) }
  }

  const statusLabel = { sent: 'Waiting on customer', approved: 'Approved ✓', changes_requested: 'Changes requested' }[order.proof_status]

  return (
    <section style={ui.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={ui.h2}>Proofs</h2>
        {statusLabel && <Badge status={order.proof_status === 'approved' ? 'proof_approved' : order.proof_status === 'sent' ? 'proof_sent' : 'revisions_requested'}>{statusLabel}</Badge>}
      </div>

      {order.revision_history?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {order.revision_history.slice().reverse().map(r => (
            <div key={r.round} style={styles.revision}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>ROUND {r.round} · {new Date(r.submittedAt).toLocaleDateString()}</div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{r.note}</div>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div style={styles.proofGrid}>
          {items.map((it, i) => (
            <div key={it.url} style={styles.proofTile}>
              {/\.pdf($|\?)/i.test(it.url)
                ? <a href={it.url} target="_blank" rel="noreferrer" style={styles.pdf}>PDF ↗</a>
                : <a href={it.url} target="_blank" rel="noreferrer"><img src={it.url} alt="" style={styles.proofImg} /></a>}
              <input placeholder="Label (optional)" value={it.label || ''} style={{ ...ui.input, padding: '6px 8px', fontSize: 13, marginTop: 6 }}
                onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
              <button onClick={() => setItems(prev => prev.filter((_, j) => j !== i))} style={styles.remove} aria-label="Remove">×</button>
            </div>
          ))}
        </div>
      )}

      <label style={{ ...styles.upload, opacity: uploading ? 0.6 : 1 }}>
        <input type="file" multiple accept="image/*,.pdf" onChange={onFiles} disabled={uploading} style={{ display: 'none' }} />
        {uploading ? 'Uploading…' : '+ Upload proof images / PDF'}
      </label>

      <Field label="Note to customer" style={{ marginTop: 12 }}><TextArea rows={2} value={note} onChange={e => setNote(e.target.value)} /></Field>
      <div style={{ ...ui.row, marginTop: 12 }}>
        <Button variant="ghost" small onClick={() => save('Proofs saved')}>Save</Button>
        <Button variant="secondary" small loading={sending} onClick={send}>{order.proof_sent_at ? 'Save & re-send proof' : 'Save & email proof'}</Button>
        <Button variant="ghost" small onClick={onCopyMessage}>Copy proof text</Button>
      </div>
    </section>
  )
}

// ── Edit request details ────────────────────────────────────────────────────
function EditModal({ order, onClose, onSave }) {
  const [f, setF] = useState({
    customer_name: order.customer_name || '', customer_email: order.customer_email || '', customer_phone: order.customer_phone || '',
    product_type: order.product_type || '', quantity: order.quantity || 1, size: order.size || '', finish: order.finish || '',
    need_by: order.need_by || '', description: order.description || '', fulfillment: order.fulfillment || 'pickup',
    street: order.shipping_address?.street || '', street2: order.shipping_address?.street2 || '',
    city: order.shipping_address?.city || '', state: order.shipping_address?.state || '', zip: order.shipping_address?.zip || '',
  })
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }))
  const productOptions = PRODUCT_TYPES.includes(f.product_type) ? PRODUCT_TYPES : [f.product_type, ...PRODUCT_TYPES]

  const save = () => onSave({
    customer_name: f.customer_name.trim(), customer_email: f.customer_email.trim().toLowerCase(), customer_phone: f.customer_phone.trim() || null,
    product_type: f.product_type, quantity: parseInt(f.quantity, 10) || 1, size: f.size || null, finish: f.finish || null,
    need_by: f.need_by || null, description: f.description, fulfillment: f.fulfillment,
    shipping_address: f.fulfillment === 'shipping'
      ? { name: f.customer_name.trim(), street: f.street, street2: f.street2, city: f.city, state: f.state.toUpperCase(), zip: f.zip }
      : null,
  })

  return (
    <Modal title="Edit details" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Customer name"><Input value={f.customer_name} onChange={set('customer_name')} /></Field>
        <div style={ui.row}>
          <Field label="Email"><Input type="email" value={f.customer_email} onChange={set('customer_email')} /></Field>
          <Field label="Phone"><Input value={f.customer_phone} onChange={set('customer_phone')} /></Field>
        </div>
        <div style={ui.row}>
          <Field label="Product"><Select value={f.product_type} onChange={set('product_type')} options={productOptions} /></Field>
          <Field label="Quantity"><Input type="number" min={1} value={f.quantity} onChange={set('quantity')} /></Field>
        </div>
        <div style={ui.row}>
          <Field label="Size"><Input value={f.size} onChange={set('size')} /></Field>
          <Field label="Finish"><Input value={f.finish} onChange={set('finish')} /></Field>
          <Field label="Need by"><Input type="date" value={f.need_by} onChange={set('need_by')} /></Field>
        </div>
        <Field label="Description"><TextArea value={f.description} onChange={set('description')} /></Field>
        <Field label="Fulfillment"><Select value={f.fulfillment} onChange={set('fulfillment')} options={[{ value: 'pickup', label: 'Pickup' }, { value: 'shipping', label: 'Shipping' }, { value: 'event', label: 'Sticker Bar (on-site)' }, ...(f.fulfillment === 'digital' ? [{ value: 'digital', label: 'Digital download' }] : [])]} /></Field>
        {f.fulfillment === 'shipping' && (
          <>
            <Field label="Street"><Input value={f.street} onChange={set('street')} /></Field>
            <Field label="Apt / suite"><Input value={f.street2} onChange={set('street2')} /></Field>
            <div style={ui.row}>
              <Field label="City" style={{ flex: 2 }}><Input value={f.city} onChange={set('city')} /></Field>
              <Field label="State" style={{ minWidth: 70 }}><Input maxLength={2} value={f.state} onChange={set('state')} /></Field>
              <Field label="ZIP" style={{ minWidth: 90 }}><Input value={f.zip} onChange={set('zip')} /></Field>
            </div>
          </>
        )}
        <Button block onClick={save}>Save changes</Button>
      </div>
    </Modal>
  )
}

function FileGrid({ urls }) {
  return (
    <div style={styles.proofGrid}>
      {urls.map(u => (
        <a key={u} href={u} target="_blank" rel="noreferrer" style={{ ...styles.proofTile, display: 'block' }}>
          {/\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(u)
            ? <img src={u} alt="" style={styles.proofImg} />
            : <div style={styles.pdf}>{u.split('.').pop().toUpperCase()} ↗</div>}
        </a>
      ))}
    </div>
  )
}

const formatTime = (t) => {
  const [h, m] = t.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const Row = ({ k, v }) => v ? (
  <>
    <dt style={{ color: 'var(--muted)', fontSize: 13 }}>{k}</dt>
    <dd style={{ fontSize: 14, fontWeight: 500 }}>{v}</dd>
  </>
) : null

const styles = {
  dl: { display: 'grid', gridTemplateColumns: '90px 1fr', rowGap: 8, columnGap: 12 },
  pre: { whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, marginTop: 10, color: 'var(--mid)' },
  line: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, padding: '6px 0', borderBottom: '1px solid var(--border)' },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  proofGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 12 },
  proofTile: { position: 'relative', border: '1px solid var(--border)', borderRadius: 12, padding: 8, background: '#fff' },
  proofImg: { width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: 8, background: 'var(--card2)', display: 'block' },
  pdf: { display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', borderRadius: 8, background: 'var(--card2)', fontWeight: 700, fontSize: 13, color: 'var(--mid)', textDecoration: 'none' },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 15, lineHeight: '20px' },
  upload: { display: 'block', textAlign: 'center', padding: 16, borderRadius: 12, border: '2px dashed var(--border)', background: 'var(--card2)', cursor: 'pointer', fontWeight: 700, color: 'var(--secondary)', fontSize: 14 },
  revision: { borderLeft: '3px solid var(--primary)', background: 'var(--card2)', borderRadius: '0 10px 10px 0', padding: '10px 12px', marginBottom: 8 },
}
