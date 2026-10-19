import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { fmt, paymentOptions } from '../lib/money'
import { BRAND, QUOTE_TERMS } from '../brand'
import { ui, Button, Field, Input, Loading, BrandHeader } from '../components/ui'

// Customer-facing progress steps.
const STEPS = [
  { label: 'Quote', done: o => Boolean(o.terms_agreed_at) },
  { label: 'Paid', done: o => Number(o.amount_paid) > 0 },
  { label: 'Proof approved', done: o => o.proof_status === 'approved' || ['in_production', 'ready_for_pickup', 'shipped', 'completed'].includes(o.status) },
  { label: 'In production', done: o => ['in_production', 'ready_for_pickup', 'shipped', 'completed'].includes(o.status) },
  { label: 'Ready', done: o => ['ready_for_pickup', 'shipped', 'completed'].includes(o.status) },
]

export default function QuoteReview() {
  const { orderId } = useParams()
  const [params, setParams] = useSearchParams()
  const justPaid = params.get('paid') === '1'
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => api(`get-order?id=${encodeURIComponent(orderId)}`).then(setOrder).catch(e => setError(e.message)), [orderId])
  useEffect(() => { load() }, [load])

  // After the Square redirect, poll briefly until the webhook records the payment.
  const [waiting, setWaiting] = useState(justPaid)
  useEffect(() => {
    if (!justPaid || !order) return
    // Webhook may have landed before the redirect finished.
    const lastPaid = Math.max(...[order.paid_at, order.deposit_paid_at].map(d => (d ? new Date(d).getTime() : 0)))
    if (Date.now() - lastPaid < 10 * 60 * 1000) { setWaiting(false); return }
    const startPaid = Number(order.amount_paid) || 0
    let tries = 0
    const t = setInterval(async () => {
      tries++
      const o = await api(`get-order?id=${encodeURIComponent(orderId)}`).catch(() => null)
      if (o && Number(o.amount_paid) > startPaid) { setOrder(o); setWaiting(false); clearInterval(t) }
      if (tries > 10) { setWaiting(false); clearInterval(t) }
    }, 3000)
    return () => clearInterval(t)
  }, [justPaid, order?.id])

  if (error) return <Shell><div style={{ ...ui.card, textAlign: 'center' }}>{error === 'Order not found' ? 'This link is invalid or has expired.' : error}</div></Shell>
  if (!order) return <Loading />

  const firstName = (order.customer_name || '').split(' ')[0]
  const isShop = order.source === 'shop'
  const isInvoice = order.source === 'invoice'
  const { paid, remaining, deposit, options } = paymentOptions(order)
  const methods = order.payment_methods || ['square']
  const inactive = ['cancelled', 'declined'].includes(order.status)

  return (
    <Shell>
      {justPaid && (
        <div style={{ ...ui.card, background: 'rgba(22,163,74,0.08)', borderColor: 'rgba(22,163,74,0.25)', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🎉</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Thank you, {firstName}!</div>
          <div style={{ ...ui.muted, marginTop: 4 }}>
            {waiting ? 'Confirming your payment…' : 'Your payment was received. A receipt is on its way to your email.'}
          </div>
          <button onClick={() => setParams({})} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--secondary)', fontWeight: 600, cursor: 'pointer' }}>Dismiss</button>
        </div>
      )}

      <div style={ui.card}>
        <div style={ui.eyebrow}>{isShop ? 'Your order' : isInvoice ? 'Invoice' : 'Your quote'} · #{order.id.slice(0, 8)}</div>
        <h1 style={{ ...ui.h1, fontSize: 26, margin: '6px 0 2px' }}>{order.product_type}</h1>
        <div style={ui.muted}>For {order.customer_name}</div>

        <Progress order={order} />

        {order.quote_breakdown?.lines?.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            {order.quote_breakdown.lines.map((l, i) => (
              <div key={i} style={styles.line}><span>{l.qty} × {l.description}</span><span>{fmt(l.qty * l.unitPrice)}</span></div>
            ))}
          </div>
        ) : (
          <dl style={styles.dl}>
            <dt>Quantity</dt><dd>{order.quantity}</dd>
            {order.size && <><dt>Size</dt><dd>{order.size}</dd></>}
            {order.finish && <><dt>Finish</dt><dd>{order.finish}</dd></>}
          </dl>
        )}
        {order.description && !order.quote_breakdown?.lines?.length && <p style={styles.desc}>{order.description}</p>}

        {order.price == null ? (
          <div style={{ ...styles.totalBox, textAlign: 'center' }}>
            <div style={{ fontWeight: 700 }}>Your quote is being prepared ✨</div>
            <div style={ui.muted}>We'll email you as soon as it's ready.</div>
          </div>
        ) : (
          <div style={styles.totalBox}>
            <div style={styles.totalRow}><span>Total</span><strong style={{ fontSize: 22 }}>{fmt(order.price)}</strong></div>
            {order.deposit_type !== 'full' && paid === 0 && deposit < order.price && (
              <div style={styles.totalRow}><span>Deposit to start</span><strong>{fmt(deposit)}</strong></div>
            )}
            {paid > 0 && <div style={styles.totalRow}><span>Paid</span><strong style={{ color: 'var(--success)' }}>−{fmt(paid)}</strong></div>}
            {paid > 0 && <div style={styles.totalRow}><span>Balance</span><strong>{remaining > 0 ? fmt(remaining) : 'Paid in full ✓'}</strong></div>}
            {order.turnaround && <div style={{ ...ui.muted, marginTop: 8 }}>Turnaround: {order.turnaround}</div>}
          </div>
        )}
        {order.quote_note && <p style={{ ...styles.desc, marginTop: 12 }}>💬 {order.quote_note}</p>}
      </div>

      {inactive && <div style={{ ...ui.card, textAlign: 'center' }}>This order is no longer active. Questions? Reply to any of our emails.</div>}

      {!inactive && order.price != null && !order.terms_agreed_at && (
        <SignCard order={order} onSigned={load} />
      )}

      {!inactive && order.price != null && order.terms_agreed_at && remaining > 0 && !waiting && (
        <div style={ui.card}>
          <h2 style={ui.h2}>Payment</h2>
          {methods.includes('square') && options.map(o => <PayButton key={o.kind} orderId={order.id} option={o} primary={o.kind !== 'full' || options.length === 1} />)}
          {methods.includes('in_person') && (
            <p style={{ ...ui.muted, marginTop: 12 }}>{order._inPersonNote || 'Prefer to pay in person? Reply to your quote email and we will set it up.'}</p>
          )}
          {methods.includes('square') && <p style={{ ...ui.muted, fontSize: 12, textAlign: 'center', marginTop: 10 }}>🔒 Secure checkout by Square</p>}
        </div>
      )}

      {(order.shop_cart || []).some(l => l.kind === 'digital') && remaining === 0 && Number(order.price) > 0 && !waiting && (
        <Link to={`/downloads/${order.id}`} style={{ textDecoration: 'none' }}>
          <Button block variant="gradient">⬇️ Get your downloads</Button>
        </Link>
      )}

      {order.proof_status === 'sent' && (
        <Link to={`/proof/${order.id}`} style={{ textDecoration: 'none' }}>
          <Button block variant="secondary">Your proof is ready — review it →</Button>
        </Link>
      )}

      {order.tracking_number && (
        <div style={ui.card}>
          <h2 style={ui.h2}>Shipped 📦</h2>
          <div>{order.shipping_carrier} · <strong>{order.tracking_number}</strong></div>
        </div>
      )}
    </Shell>
  )
}

function SignCard({ order, onSigned }) {
  const [agreed, setAgreed] = useState(false)
  const [signature, setSignature] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const sign = async () => {
    setBusy(true); setError('')
    try {
      await api('accept-quote', { body: { orderId: order.id, signature, agreed } })
      await onSigned()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={ui.card}>
      <h2 style={ui.h2}>Agreement</h2>
      <ol style={styles.terms}>
        {QUOTE_TERMS.map((t, i) => <li key={i}>{t}</li>)}
      </ol>
      <label style={styles.agree}>
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 3 }} />
        <span>I've reviewed this {order.source === 'invoice' ? 'invoice' : 'quote'} and agree to the terms above.</span>
      </label>
      <Field label="Type your full name to sign" style={{ marginTop: 12 }}>
        <Input value={signature} onChange={e => setSignature(e.target.value)} placeholder={order.customer_name}
          style={{ fontFamily: "'Dancing Script', cursive", fontSize: 26, padding: '8px 14px' }} />
      </Field>
      {error && <div style={{ ...ui.error, marginTop: 12 }}>{error}</div>}
      <Button block loading={busy} disabled={!agreed || signature.trim().length < 2} onClick={sign} style={{ marginTop: 14 }}>
        Sign & continue to payment
      </Button>
    </div>
  )
}

function PayButton({ orderId, option, primary }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pay = async () => {
    setBusy(true); setError('')
    try {
      const { url } = await api('create-checkout', { body: { orderId, kind: option.kind } })
      window.location.href = url
    } catch (e) { setError(e.message); setBusy(false) }
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <Button block variant={primary ? 'primary' : 'ghost'} loading={busy} onClick={pay}>{option.label}</Button>
      {error && <div style={{ ...ui.error, marginTop: 8 }}>{error}</div>}
    </div>
  )
}

function Progress({ order }) {
  if (['cancelled', 'declined'].includes(order.status) || order.price == null || order.fulfillment === 'digital') return null
  return (
    <div style={styles.progress}>
      {STEPS.map((s, i) => {
        const done = s.done(order)
        return (
          <div key={s.label} style={styles.step}>
            <div style={{ ...styles.dot, background: done ? 'var(--primary)' : 'var(--border)' }}>{done ? '✓' : i + 1}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: done ? 'var(--dark)' : 'var(--muted)', textAlign: 'center' }}>{s.label}</div>
          </div>
        )
      })}
    </div>
  )
}

function Shell({ children }) {
  return (
    <div style={{ ...ui.page, paddingBottom: 40 }}>
      <BrandHeader />
      <div style={{ ...ui.wrap, maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
        <p style={{ ...ui.muted, textAlign: 'center', fontSize: 12 }}>{BRAND.name} · {BRAND.location}</p>
      </div>
    </div>
  )
}

const styles = {
  dl: { display: 'grid', gridTemplateColumns: '80px 1fr', rowGap: 6, marginTop: 16, fontSize: 14 },
  desc: { whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--mid)', lineHeight: 1.6, marginTop: 10 },
  line: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 },
  totalBox: { background: 'var(--card2)', borderRadius: 14, padding: 16, marginTop: 16 },
  totalRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0' },
  terms: { paddingLeft: 18, fontSize: 13, color: 'var(--mid)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 6 },
  agree: { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, fontWeight: 500, marginTop: 14, cursor: 'pointer' },
  progress: { display: 'flex', justifyContent: 'space-between', margin: '18px 0 4px', gap: 4 },
  step: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  dot: { width: 24, height: 24, borderRadius: '50%', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' },
}
