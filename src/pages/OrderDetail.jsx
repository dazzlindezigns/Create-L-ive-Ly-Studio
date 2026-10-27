import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api, uploadFile, APP_URL } from '../lib/api'
import { fmt, round2, paymentOptions, depositFor, refundable } from '../lib/money'
import { STATUS, orderFlow, statusesFor, stepsFor, nextStep } from '../lib/status'
import { trackingUrl } from '../../api/_lib/shipping.js'
import { commissionFor } from '../lib/affiliates'
import { BRAND, PRODUCT_TYPES, PARTNER_PROGRAM } from '../brand'
import Nav from '../components/Nav'
import ShipModal from '../components/ShipModal'
import EmailPanel from '../components/EmailPanel'
import { ui, Badge, Button, Field, Input, TextArea, Select, Loading, useFlash, Modal } from '../components/ui'

const PRE_PAYMENT = ['pending', 'quote_sent', 'invoice_sent', 'payment_pending']
// Statuses with a ready-made customer email (api/_handlers/send-status-update.js).
const STAGE_EMAILS = { in_production: 'In production', ready_for_pickup: 'Ready for pickup', completed: 'Thank-you', declined: 'Declined' }
const isPaid = (o) => Boolean(o.balance_paid) || (Number(o.price) > 0 && Number(o.amount_paid) >= Number(o.price) - 0.009)
const openPdf = (o) => window.open(`/quote/${o.id}?print=1`, '_blank')

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
  const [refundOpen, setRefundOpen] = useState(false)

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

  if (notFound) return <div style={ui.page} className="admin-page"><Nav back="/dashboard" backLabel="Orders" /><div style={{ ...ui.wrap, textAlign: 'center', paddingTop: 60 }}>Order not found.</div></div>
  if (!order) return <div style={ui.page} className="admin-page"><Nav back="/dashboard" backLabel="Orders" /><Loading /></div>

  const flow = orderFlow(order)
  const firstName = (order.customer_name || '').split(' ')[0] || 'there'
  const copy = (text, msg) => navigator.clipboard.writeText(text).then(() => flash(msg), () => flash('Copy failed', 'error'))
  const sendStage = (stage) => api('send-status-update', { auth: true, body: { orderId: order.id, stage } })

  // The big "next step" button, and the status menu for when a step was skipped or done out of order.
  // Statuses with a customer email send it automatically, from the button or the menu.
  const setStatus = async (status) => {
    if (!(await update({ status }, null))) return
    if (STAGE_EMAILS[status] && order.customer_email) {
      try { await sendStage(status); flash(`${STATUS[status].label} — emailed ${firstName} ✉️`); load() }
      catch (e) { flash(`Status saved, but the email didn’t send: ${e.message}`, 'error') }
    } else flash(`Status → ${STATUS[status]?.label || status}`)
  }
  const runStep = async (step) => {
    if (step.action === 'ship') return setShipOpen(true)
    if (step.action === 'quote' || step.action === 'proof') {
      return document.getElementById(step.action)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    await setStatus(step.status)
  }
  const pickStatus = async (status) => {
    // Shipping always goes through the modal so the tracking email can go out.
    if (status === 'shipped' && order.status !== 'shipped') return setShipOpen(true)
    await setStatus(status)
  }

  const shop = flow !== 'custom'
  const hasDigital = (order.shop_cart || []).some(l => l.kind === 'digital')

  return (
    <div style={ui.page} className="admin-page">
      <Nav back="/dashboard" backLabel="Orders" />
      <div style={{ ...ui.wrap, maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Header: who, where it is, and the one thing to do next */}
        <section style={ui.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={ui.eyebrow}>{{ shop: 'Shop order', digital: 'Digital order', custom: order.source === 'invoice' ? 'Invoice' : 'Custom request' }[flow]} · #{order.id.slice(0, 8)}</div>
              <h1 style={{ ...ui.h1, fontSize: 24, marginTop: 4 }}>{order.customer_name}</h1>
              <div style={{ ...ui.muted, marginTop: 4 }}>
                <a href={`mailto:${order.customer_email}`}>{order.customer_email}</a>
                {order.customer_phone && <> · <a href={`tel:${order.customer_phone}`}>{order.customer_phone}</a></>}
              </div>
              {order.fulfillment === 'shipping' && order.shipping_address?.street && (
                <div style={{ ...ui.muted, marginTop: 2 }}>📦 {[order.shipping_address.street, order.shipping_address.street2, `${order.shipping_address.city}, ${order.shipping_address.state} ${order.shipping_address.zip}`].filter(Boolean).join(', ')}</div>
              )}
              <div style={{ ...ui.muted, marginTop: 2 }}>{shop ? 'Ordered' : 'Received'} {new Date(order.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </div>
            <Badge status={order.status} />
          </div>

          <StepTracker order={order} />
          <NextStep order={order} firstName={firstName} onRun={runStep} />


          <div style={styles.statusRow}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
              Change status
              <Select value={order.status} onChange={e => pickStatus(e.target.value)} style={styles.statusSelect}
                options={statusesFor(order).map(k => ({ value: k, label: STATUS[k]?.label || k }))} />
            </label>
            <button onClick={() => setEditOpen(true)} style={styles.linkBtn}>Edit details</button>
          </div>
        </section>

        <div className="detail-cols">
          <div className="detail-col">
            {shop ? (
              <ItemsSection order={order} payments={payments} flash={flash} onRecordPayment={() => setPayOpen(true)} onRefund={() => setRefundOpen(true)} sendStage={sendStage} load={load} />
            ) : (
              <>
                <RequestSection order={order} />
                <QuoteSection order={order} payments={payments} update={update} flash={flash} reload={load} sendStage={sendStage}
                  onCopyLink={() => copy(`${APP_URL}/quote/${order.id}`, 'Quote link copied')}
                  onRecordPayment={() => setPayOpen(true)} onRefund={() => setRefundOpen(true)} />
                {/* Proofs come after payment; before that the page is just the request and the quote. */}
                {(!PRE_PAYMENT.includes(order.status) || order.proof_items?.length > 0 || order.proof_urls?.length > 0) && <ProofSection order={order} update={update} flash={flash} reload={load}
                  onCopyMessage={() => copy(
                    `Hey ${firstName}! Your proof is ready for review. Tap the link below to approve or request changes — this takes less than a minute!\n\n${APP_URL}/proof/${order.id}\n\n— ${BRAND.ownerFirstName}`,
                    'Proof message copied — paste it into a text!',
                  )} />}
              </>
            )}
          </div>
          <div className="detail-col">
            {hasDigital && <DigitalSection order={order} flash={flash} onCopy={() => copy(`${APP_URL}/downloads/${order.id}`, 'Download link copied')} />}
            {order.fulfillment !== 'digital' && <DeliverySection order={order} copy={copy} onShip={() => setShipOpen(true)} />}
            <ReviewAsk order={order} firstName={firstName} flash={flash} copy={copy} sendStage={sendStage} reload={load} />
            <EmailPanel order={order} flash={flash} />
            <PrivateNote order={order} update={update} />

            <section style={{ ...ui.card, display: 'flex', gap: 10, flexWrap: 'wrap', padding: 14 }}>
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
        </div>
      </div>

      {shipOpen && <ShipModal order={order} onClose={() => setShipOpen(false)} onDone={(msg) => { setShipOpen(false); flash(msg); load() }} />}
      {editOpen && <EditModal order={order} onClose={() => setEditOpen(false)} onSave={async (f) => { if (await update(f, 'Details updated')) setEditOpen(false) }} />}
      {refundOpen && <RefundModal order={order} payments={payments} firstName={firstName} onClose={() => setRefundOpen(false)} onDone={(msg) => { setRefundOpen(false); flash(msg); load() }} />}
      {payOpen && <PaymentModal order={order} onClose={() => setPayOpen(false)} onSaved={(msg) => { setPayOpen(false); flash(msg); load() }} flash={flash} />}
      {toast}
    </div>
  )
}

// ── Where the order is ──────────────────────────────────────────────────────
function StepTracker({ order }) {
  const { steps, current } = stepsFor(order)
  if (current < 0) return null
  // On the last step ("Done"/"Delivered") every step is finished.
  const finished = current === steps.length - 1
  return (
    <ol style={styles.steps}>
      {steps.map((label, i) => {
        const done = i < current || finished
        const now = i === current && !finished
        return (
          <li key={label} style={{ ...styles.step, color: now ? 'var(--primary)' : done ? 'var(--dark)' : 'var(--muted)' }}>
            <span style={{ ...styles.stepDot, ...(done ? styles.stepDone : now ? styles.stepNow : {}) }}>{done ? '✓' : i + 1}</span>
            <span style={{ fontWeight: now ? 800 : 600 }}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function NextStep({ order, firstName, onRun }) {
  const step = nextStep(order)
  const [busy, setBusy] = useState(false)
  const run = async (s) => {
    // Scrolling and opening the ship form are instant; only status changes wait on the server.
    if (s.action !== 'status') return onRun(s)
    setBusy(true)
    try { await onRun(s) } finally { setBusy(false) }
  }

  return (
    <div style={styles.next}>
      {step.label ? (
        <>
          <div style={ui.eyebrow}>Next step</div>
          <Button loading={busy} onClick={() => run(step)} style={{ marginTop: 8, width: '100%', maxWidth: 420 }}>{step.label}</Button>
          {step.hint && <div style={ui.hint}>{step.hint}</div>}
          {(step.email || step.action === 'ship') && order.customer_email && (
            <div style={{ ...ui.hint, fontWeight: 600 }}>✉️ {firstName} gets {step.email === 'completed' ? 'a thank-you email' : 'an email'} automatically.</div>
          )}
        </>
      ) : step.waiting ? (
        <div style={{ fontSize: 14 }}><strong>⏳ Waiting</strong><div style={{ ...ui.muted, marginTop: 2 }}>{step.waiting}</div></div>
      ) : (
        <div style={{ fontSize: 14, fontWeight: 700, color: order.status === 'completed' ? 'var(--success)' : 'var(--muted)' }}>{order.status === 'completed' ? '✓ ' : ''}{step.done}</div>
      )}
      {step.alt && (
        <button disabled={busy} onClick={() => run({ ...step.alt, action: 'status' })} style={{ ...styles.linkBtn, marginTop: 8 }}>{step.alt.label}</button>
      )}
    </div>
  )
}

// ── Shop orders: what they bought and what they paid ───────────────────────
function ItemsSection({ order, payments, flash, onRecordPayment, onRefund, sendStage, load }) {
  const [sending, setSending] = useState(false)
  const lines = order.shop_cart || []
  // Discount / shipping lines come after the item lines in the description (create-shop-order.js).
  const extras = String(order.description || '').split('\n').slice(lines.length).filter(Boolean)
  const paid = isPaid(order)
  const emailReceipt = async () => {
    setSending(true)
    try { await sendStage('receipt'); flash('Receipt emailed ✉️'); load() }
    catch (e) { flash(e.message, 'error') } finally { setSending(false) }
  }

  return (
    <section style={ui.card}>
      <h2 style={ui.h2}>What they ordered</h2>
      {lines.map((l, i) => (
        <div key={i} style={styles.line}>
          <span style={{ minWidth: 0 }}>
            <strong>{l.kind === 'digital' ? '' : `${l.quantity} × `}{l.productName}</strong>
            {(l.option || l.kind === 'digital') && <div style={ui.muted}>{l.kind === 'digital' ? '⬇ Digital download' : l.option}</div>}
            {l.use === 'business' && <div style={{ ...ui.muted, color: 'var(--secondary)', fontWeight: 700 }}>💼 Small business use</div>}
            {l.use === 'personal' && <div style={ui.muted}>Personal use</div>}
          </span>
          <span>{fmt(l.itemTotal)}</span>
        </div>
      ))}
      {extras.map((t, i) => <div key={i} style={{ ...styles.line, color: 'var(--muted)' }}><span>{t}</span></div>)}
      <div style={{ ...styles.line, borderBottom: 'none', fontWeight: 800, fontSize: 15 }}><span>Total</span><span>{fmt(order.price)}</span></div>

      {order.notes && <><div style={{ ...ui.label, marginTop: 12 }}>Customer note</div><p style={styles.pre}>{order.notes}</p></>}
      {order.image_urls?.length > 0 && <><div style={{ ...ui.label, marginTop: 12 }}>Customer files</div><FileGrid urls={order.image_urls} /></>}

      <div style={{ ...styles.payBox, ...(paid ? styles.payBoxPaid : {}) }}>
        {paid
          ? <>✓ {Number(order.price) > 0 ? `Paid ${fmt(order.amount_paid)}` : `Free order${order.shop_discount_code ? ` (code ${order.shop_discount_code})` : ''}`}{order.paid_at && ` · ${new Date(order.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}</>
          : <>Not paid yet</>}
      </div>
      <Refunded order={order} />
      <PartnerTag order={order} />
      <div style={{ ...ui.row, marginTop: 12 }}>
        {paid ? (
          <>
            <Button variant="ghost" small onClick={() => openPdf(order)}>📄 Download receipt</Button>
            <Button variant="ghost" small loading={sending} onClick={emailReceipt}>✉️ Email receipt</Button>
            {refundable(payments).total > 0 && <Button variant="ghost" small onClick={onRefund}>↩️ Refund</Button>}
          </>
        ) : (
          <Button variant="ghost" small onClick={onRecordPayment}>They paid another way — record it</Button>
        )}
      </div>
    </section>
  )
}

// ── Custom requests: what they asked for ───────────────────────────────────
function RequestSection({ order }) {
  return (
    <section style={ui.card}>
      <h2 style={ui.h2}>Request</h2>
      <dl style={styles.dl}>
        <Row k="Product" v={`${order.product_type} × ${order.quantity}`} />
        <Row k="Size" v={order.size} />
        <Row k="Finish" v={order.finish} />
        <Row k="Need by" v={order.need_by && new Date(order.need_by + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} />
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
  )
}

// ── Shipping or pickup ──────────────────────────────────────────────────────
function DeliverySection({ order, copy, onShip }) {
  const a = order.shipping_address
  const ship = order.fulfillment === 'shipping'
  const address = a?.street ? [a.name || order.customer_name, a.street, a.street2, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean).join('\n') : ''
  return (
    <section style={ui.card}>
      <h2 style={ui.h2}>{ship ? 'Shipping' : 'Pickup'}</h2>
      {ship ? (
        <>
          {address
            ? <div style={{ whiteSpace: 'pre-line', fontSize: 14, lineHeight: 1.5 }}>{address}</div>
            : <p style={ui.muted}>No address on file — use Edit details to add one.</p>}
          {address && <button onClick={() => copy(address, 'Address copied')} style={styles.linkBtn}>Copy address</button>}
          {order.shipped_at && (
            <dl style={{ ...styles.dl, marginTop: 12 }}>
              <Row k="Shipped" v={new Date(order.shipped_at).toLocaleDateString()} />
              <Row k="Carrier" v={order.shipping_carrier} />
              <Row k="Tracking" v={order.tracking_number && <a href={trackingUrl(order.shipping_carrier, order.tracking_number)} target="_blank" rel="noreferrer">{order.tracking_number} ↗</a>} />
            </dl>
          )}
          {order.shipped_at && <button onClick={onShip} style={styles.linkBtn}>{order.tracking_number ? 'Change tracking' : 'Add tracking'}</button>}
        </>
      ) : <p style={ui.muted}>Customer picks up — {BRAND.pickupLabel}.</p>}
    </section>
  )
}

// ── Digital downloads ───────────────────────────────────────────────────────
function DigitalSection({ order, flash, onCopy }) {
  const [sending, setSending] = useState(false)
  const items = order.shop_cart.filter(l => l.kind === 'digital')
  // Same rule as isPaidInFull() in api/_lib/downloads.js (balance_paid covers free $0 orders).
  const paidInFull = isPaid(order)
  const resend = async () => {
    setSending(true)
    try { await api('send-downloads', { body: { orderId: order.id }, auth: true }); flash('Download email sent ✉️') }
    catch (e) { flash(e.message, 'error') } finally { setSending(false) }
  }
  return (
    <section style={ui.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={ui.h2}>Downloads</h2>
        <span style={ui.muted}>{paidInFull ? `Opened ${order.download_count || 0}×` : 'Locked until paid'}</span>
      </div>
      {items.map((l, i) => (
        <div key={i} style={styles.line}><span>{l.productName}</span><span style={ui.muted}>{l.digitalFileName}</span></div>
      ))}
      <div style={{ ...ui.row, marginTop: 12 }}>
        <Button variant="secondary" small loading={sending} disabled={!paidInFull} onClick={resend}>Re-send download email</Button>
        <Button variant="ghost" small onClick={onCopy}>Copy download link</Button>
      </div>
      {!paidInFull && <div style={ui.hint}>The link unlocks automatically after a card payment. If they paid another way, record the payment first, then email the link.</div>}
    </section>
  )
}

// ── Private note (never shown to customers) ─────────────────────────────────
function PrivateNote({ order, update }) {
  const [notes, setNotes] = useState(order.internal_notes || '')
  const dirty = notes !== (order.internal_notes || '')
  return (
    <section style={{ ...ui.card, padding: 14 }}>
      <Field label="📝 Private note — only you see this">
        <TextArea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </Field>
      {dirty && <Button small onClick={() => update({ internal_notes: notes.trim() || null }, 'Note saved')} style={{ marginTop: 8 }}>Save note</Button>}
    </section>
  )
}

// ── Quote + payments ────────────────────────────────────────────────────────
function QuoteSection({ order, payments, update, flash, reload, sendStage, onCopyLink, onRecordPayment, onRefund }) {
  const navigate = useNavigate()
  const [q, setQ] = useState({
    price: order.price ?? '',
    deposit_type: order.deposit_type || 'percent',
    deposit_amount: order.deposit_amount ?? 50,
    turnaround: order.turnaround || '',
    quote_note: order.quote_note || '',
    card: (order.payment_methods || ['card']).includes('card'),
    in_person: (order.payment_methods || []).includes('in_person'),
  })
  const [sending, setSending] = useState(false)
  const [reminding, setReminding] = useState(false)
  const set = (k) => (e) => setQ(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const fields = () => ({
    price: q.price === '' ? null : round2(q.price),
    deposit_type: q.deposit_type,
    deposit_amount: q.deposit_type === 'full' ? round2(q.price) : Number(q.deposit_amount) || 0,
    turnaround: q.turnaround.trim() || null,
    quote_note: q.quote_note.trim() || null,
    payment_methods: [q.card && 'card', q.in_person && 'in_person'].filter(Boolean),
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
  const fromCalculator = Boolean(order.quote_breakdown?.internal?.items?.length)
  const canUseCalculator = !locked && order.source !== 'shop'

  return (
    <section id="quote" style={{ ...ui.card, scrollMarginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={ui.h2}>Quote & payment</h2>
        {order.quote_sent_at && <span style={ui.muted}>Sent {new Date(order.quote_sent_at).toLocaleDateString()}</span>}
      </div>

      {canUseCalculator && (
        <div style={styles.aiQuote}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700 }}>✨ {fromCalculator ? 'Priced with the pricing assistant' : 'Price this request with the pricing assistant'}</div>
            <div style={ui.hint}>{fromCalculator
              ? 'Open it again to adjust supplies, labor or markup.'
              : 'It reads the request and the customer’s photos, estimates supplies and labor, and you review before anything is sent.'}</div>
          </div>
          <Button small variant="gradient" onClick={() => navigate(`/dashboard/calculator?order=${order.id}`)}>
            {fromCalculator ? 'Open pricing assistant' : 'Get a price estimate'}
          </Button>
        </div>
      )}

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
          <label style={styles.check}><input type="checkbox" checked={q.card} onChange={set('card')} /> Card (Stripe)</label>
          <label style={styles.check}><input type="checkbox" checked={q.in_person} onChange={set('in_person')} /> In person / cash</label>
        </div>
        <div style={ui.row}>
          <Button variant="ghost" small onClick={() => update(fields())}>Save</Button>
          <Button small loading={sending} onClick={send}>{order.quote_sent_at ? 'Save & re-send quote' : 'Save & send quote'}</Button>
          <Button variant="ghost" small onClick={onCopyLink}>Copy quote link</Button>
          {order.price != null && (
            <Button variant="ghost" small onClick={() => openPdf(order)}>📄 {paid > 0 && remaining <= 0 ? 'Receipt' : order.source === 'invoice' ? 'Invoice' : 'Quote'} PDF</Button>
          )}
          {paid > 0 && (
            <Button variant="ghost" small loading={reminding === 'receipt'} onClick={async () => {
              setReminding('receipt')
              try { await sendStage('receipt'); flash('Receipt emailed ✉️'); reload() }
              catch (e) { flash(e.message, 'error') } finally { setReminding(false) }
            }}>✉️ Email receipt</Button>
          )}
          {order.quote_sent_at && remaining > 0 && (
            <Button variant="ghost" small loading={reminding === 'reminder'} onClick={async () => {
              setReminding('reminder')
              try { await sendStage('payment_reminder'); flash('Payment reminder sent ✉️'); reload() }
              catch (e) { flash(e.message, 'error') } finally { setReminding(false) }
            }}>⏰ Payment reminder</Button>
          )}
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
              <span>{p.kind === 'refund' ? '↩️ refund' : p.kind} · {new Date(p.paid_at || p.created_at).toLocaleDateString()}</span>
              {p.kind === 'refund'
                ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>−{fmt(p.amount)}</span>
                : <span style={{ color: p.status === 'paid' ? 'var(--success)' : 'var(--muted)', fontWeight: 600 }}>{fmt(p.amount)} {p.status === 'paid' ? '✓' : '(link opened)'}</span>}
            </div>
          ))}
        </div>
      )}
      <Refunded order={order} />
      <div style={{ ...ui.row, marginTop: 12 }}>
        {remaining > 0 && <Button variant="ghost" small onClick={onRecordPayment}>Record cash / other payment</Button>}
        {refundable(payments).total > 0 && <Button variant="ghost" small onClick={onRefund}>↩️ Refund</Button>}
      </div>
    </section>
  )
}

// ── Reviews: has this customer reviewed, and a way to (re)send the link ─────────
function ReviewAsk({ order, firstName, flash, copy, sendStage, reload }) {
  const [heard, setHeard] = useState(null) // { review, feedback }
  const [sending, setSending] = useState(false)
  const paid = Number(order.amount_paid) > 0 || order.balance_paid
  useEffect(() => {
    if (!paid) return
    Promise.all([
      supabase.from('reviews').select('rating').eq('order_id', order.id),
      supabase.from('feedback').select('rating').eq('order_id', order.id).maybeSingle(),
    ]).then(([r, f]) => setHeard({ reviews: r.data || [], feedback: f.data }))
  }, [order.id, paid])
  if (!paid || ['cancelled', 'declined', 'refunded'].includes(order.status) || !heard) return null

  const link = `${APP_URL}/review/${order.id}`
  const best = heard.reviews.length ? Math.max(...heard.reviews.map(r => r.rating)) : null
  const status = heard.reviews.length || heard.feedback
    ? `✓ ${heard.reviews.length ? `Reviewed (${'★'.repeat(best)})` : ''}${heard.reviews.length && heard.feedback ? ' · ' : ''}${heard.feedback ? 'Left feedback' : ''}`
    : order.review_reminder_sent_at ? `Asked ${new Date(order.review_reminder_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — no review yet`
    : order.status === 'completed' ? 'No review yet — a reminder goes out automatically 5 days after it’s complete'
    : 'The review link goes out with the thank-you email when it’s complete'
  const email = async () => {
    setSending(true)
    try { await sendStage('review_request'); flash(`Review link emailed to ${firstName} ⭐`); reload() }
    catch (e) { flash(e.message, 'error') } finally { setSending(false) }
  }
  return (
    <section style={{ ...ui.card, padding: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>⭐ Review & feedback</div>
      <div style={{ ...ui.muted, marginTop: 2 }}>{status}</div>
      <div style={{ ...ui.row, gap: 8, marginTop: 10 }}>
        <Button small variant="ghost" loading={sending} onClick={email}>Email review link</Button>
        <Button small variant="ghost" onClick={() => copy(`Hey ${firstName}! Thank you so much for your order 💕 Would you take a minute to tell me how we did? Just tap the stars:\n\n${link}\n\n— ${BRAND.ownerFirstName}`, 'Review message copied — paste it into a text!')}>Copy text</Button>
      </div>
    </section>
  )
}

// ── Partner who sent this order (affiliate link) ────────────────────────────
function PartnerTag({ order }) {
  const [name, setName] = useState(null)
  useEffect(() => {
    if (!order.affiliate_id) return
    supabase.from('affiliates').select('name').eq('id', order.affiliate_id).maybeSingle().then(({ data }) => setName(data?.name || 'a partner'))
  }, [order.affiliate_id])
  if (!order.affiliate_id || !name) return null
  const c = commissionFor(order)
  return (
    <div style={{ ...ui.hint, fontSize: 13, marginTop: 8 }}>
      {PARTNER_PROGRAM.icon} Came from <strong>{name}</strong>’s link{c.state !== 'void' && <> · they earn {fmt(c.amount)}{c.state === 'paid' ? ' (paid)' : c.state === 'pending' ? ' once it’s complete' : ''}</>}
    </div>
  )
}

// ── Refunds ────────────────────────────────────────────────────────────────
function Refunded({ order }) {
  if (!(Number(order.refunded_amount) > 0)) return null
  return (
    <div style={{ ...styles.payBox, background: 'rgba(200,65,75,0.08)', color: 'var(--danger)', marginTop: 8 }}>
      ↩️ Refunded {fmt(order.refunded_amount)}{order.refunded_at && ` · ${new Date(order.refunded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
    </div>
  )
}

// Her policy: only ready-made physical shop items are refundable. The app still lets her refund
// anything (her call), but reminds her what the customer agreed to.
function finalSaleNote(order) {
  if (order.source !== 'shop') return 'Custom orders are final sale under your terms — refund only if you choose to.'
  const lines = order.shop_cart || []
  if (lines.length && lines.every(l => l.kind === 'digital')) return 'Digital downloads are final sale — the customer agreed at checkout. Refund only if you choose to.'
  if (lines.some(l => l.kind === 'digital')) return 'Includes digital downloads, which are final sale. Consider refunding only the physical items (use Partial).'
  return null
}

function RefundModal({ order, payments, firstName, onClose, onDone }) {
  const avail = refundable(payments)
  const [mode, setMode] = useState('full')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const physical = order.source === 'shop' && (order.shop_cart || []).some(l => l.kind === 'physical')
  const [restock, setRestock] = useState(physical && !['shipped', 'completed'].includes(order.status))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const want = mode === 'full' ? avail.total : round2(amount)
  // Card money is refunded first, so only the part beyond the card total is hers to hand back.
  const byHand = Math.max(0, round2(want - avail.card))
  const valid = want > 0 && want <= avail.total + 0.009

  const submit = async () => {
    if (!valid) return setError(`Enter an amount up to ${fmt(avail.total)}`)
    if (!confirm(`Refund ${fmt(want)} to ${order.customer_name}? This can’t be undone.`)) return
    setBusy(true); setError('')
    try {
      await api('refund-order', { auth: true, body: { orderId: order.id, amount: want, note: note.trim() || null, restock: mode === 'full' && restock } })
      onDone(`Refunded ${fmt(want)} — ${firstName} was emailed ✉️`)
    } catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <Modal title="Refund" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={styles.toggle}>
          {[['full', `Full refund · ${fmt(avail.total)}`], ['partial', 'Partial']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setMode(k)} style={{ ...styles.toggleBtn, ...(mode === k ? styles.toggleOn : {}) }}>{label}</button>
          ))}
        </div>
        {finalSaleNote(order) && <div style={{ ...ui.hint, fontSize: 13, color: 'var(--warning)', fontWeight: 600 }}>{finalSaleNote(order)}</div>}
        {mode === 'partial' && (
          <Field label="Amount to refund ($)" hint={`Up to ${fmt(avail.total)}`}>
            <Input type="number" step="0.01" min="0" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
          </Field>
        )}
        <Field label="Reason (optional — only you see this)"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. arrived damaged" /></Field>
        {want > 0 && (
          <div style={{ ...ui.hint, fontSize: 13, lineHeight: 1.5 }}>
            {want - byHand > 0 && <div>💳 {fmt(want - byHand)} goes back to their card automatically (5–10 business days).</div>}
            {byHand > 0 && <div>💵 {fmt(byHand)} was paid another way — send that back yourself; the app just records it.</div>}
          </div>
        )}
        {mode === 'full' && physical && (
          <label style={styles.emailCheck}><input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} /> Put the items back in stock</label>
        )}
        <div style={ui.hint}>✉️ {firstName} gets an email that the refund is on its way.</div>
        {mode === 'full' && <div style={ui.hint}>A full refund closes the order as Refunded{(order.shop_cart || []).some(l => l.kind === 'digital') ? ' and turns off their download link' : ''}.</div>}
        {error && <div style={ui.error}>{error}</div>}
        <Button block variant="secondary" loading={busy} disabled={!valid} onClick={submit}>Refund {valid ? fmt(want) : ''}</Button>
      </div>
    </Modal>
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
    // Downloads-only orders are done once paid; everything else moves on to making.
    if (PRE_PAYMENT.includes(order.status)) fields.status = orderFlow(order) === 'digital' && fields.balance_paid ? 'completed' : 'confirmed'
    const { error: e1 } = await supabase.from('payments').insert({ order_id: order.id, kind: 'manual', amount: amt, status: 'paid', paid_at: now })
    const { error: e2 } = await supabase.from('orders').update(fields).eq('id', order.id)
    setBusy(false)
    if (e1 || e2) return flash((e1 || e2).message, 'error')
    onSaved(`Recorded ${fmt(amt)}`)
  }
  return (
    <Modal title="Record a payment" onClose={onClose}>
      <p style={{ ...ui.muted, marginBottom: 12 }}>For cash, Zelle, Cash App, etc. — anything paid outside Stripe.</p>
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
    <section id="proof" style={{ ...ui.card, scrollMarginTop: 16 }}>
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
        <Field label="Fulfillment"><Select value={f.fulfillment} onChange={set('fulfillment')} options={[{ value: 'pickup', label: 'Pickup' }, { value: 'shipping', label: 'Shipping' }, ...(f.fulfillment === 'digital' ? [{ value: 'digital', label: 'Digital download' }] : [])]} /></Field>
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

const Row = ({ k, v }) => v ? (
  <>
    <dt style={{ color: 'var(--muted)', fontSize: 13 }}>{k}</dt>
    <dd style={{ fontSize: 14, fontWeight: 500 }}>{v}</dd>
  </>
) : null

const styles = {
  statusRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' },
  statusSelect: { width: 'auto', padding: '6px 10px', fontSize: 14, borderRadius: 10 },
  linkBtn: { background: 'none', border: 'none', color: 'var(--secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: '6px 0', display: 'block' },
  steps: { listStyle: 'none', display: 'flex', gap: 4, marginTop: 16 },
  step: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 12, flex: '1 1 0', minWidth: 0, textAlign: 'center' },
  stepDot: { width: 22, height: 22, borderRadius: '50%', border: '1.5px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, background: 'var(--card)' },
  stepDone: { background: 'var(--success)', borderColor: 'var(--success)', color: '#fff' },
  stepNow: { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' },
  next: { marginTop: 14, padding: 14, borderRadius: 14, background: 'var(--card2)', border: '1px solid var(--border)' },
  toggle: { display: 'flex', background: 'var(--card2)', borderRadius: 50, padding: 4, gap: 4 },
  toggleBtn: { flex: 1, padding: '10px 12px', borderRadius: 50, border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--mid)' },
  toggleOn: { background: '#fff', color: 'var(--dark)', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' },
  emailCheck: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginTop: 10, cursor: 'pointer' },
  payBox: { marginTop: 14, padding: '10px 12px', borderRadius: 12, background: 'rgba(199,128,43,0.1)', color: 'var(--warning)', fontWeight: 700, fontSize: 14 },
  payBoxPaid: { background: 'rgba(47,158,98,0.1)', color: 'var(--success)' },
  aiQuote: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, marginBottom: 14 },
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
