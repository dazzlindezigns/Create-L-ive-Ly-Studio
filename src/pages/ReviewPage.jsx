import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { BRAND } from '../brand'
import Stars from '../components/Stars'
import { ui, Button, Field, Input, TextArea, BrandHeader, Loading } from '../components/ui'

// /review/:orderId — one page per order: star reviews for each product (public) and
// "how was shopping with us?" (private, just for the owner). Linked from the thank-you
// email, the download email and the order page. Submitting again updates their answers.
export default function ReviewPage() {
  const { orderId } = useParams()
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [products, setProducts] = useState([])
  const [feedback, setFeedback] = useState({ rating: 0, body: '' })
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    api(`get-review?id=${encodeURIComponent(orderId)}`).then(r => {
      setD(r); setProducts(r.products); setName(r.name || ''); if (r.feedback) setFeedback(r.feedback)
    }).catch(e => setError(e.message))
  }, [orderId])

  if (error) return <Shell><div style={{ ...ui.card, textAlign: 'center' }}>{error === 'Order not found' ? 'This link isn’t valid.' : error}</div></Shell>
  if (!d) return <Loading />

  const setProduct = (id, k, v) => setProducts(prev => prev.map(p => p.id === id ? { ...p, [k]: v } : p))
  const rated = products.filter(p => p.rating > 0)

  const submit = async () => {
    if (!rated.length && !feedback.rating && !feedback.body.trim()) return setFormError('Tap the stars to leave a rating')
    setBusy(true); setFormError('')
    try {
      await api('submit-review', {
        body: {
          orderId, name,
          reviews: rated.map(p => ({ productId: p.id, rating: p.rating, body: p.body })),
          feedback: { rating: feedback.rating || null, body: feedback.body },
        },
      })
      setDone(true); window.scrollTo(0, 0)
    } catch (e) { setFormError(e.message) } finally { setBusy(false) }
  }

  if (done) {
    return (
      <Shell>
        <div style={{ ...ui.card, textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 40 }}>💕</div>
          <h1 style={{ ...ui.h1, fontSize: 26, marginTop: 8 }}>Thank you, {d.firstName}!</h1>
          <p style={{ ...ui.muted, fontSize: 14, marginTop: 8 }}>Your words mean so much to a small business like ours.</p>
          <Link to="/shop/products" style={{ display: 'inline-block', marginTop: 16, fontWeight: 700 }}>Back to the shop →</Link>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ ...ui.h1, fontSize: 26 }}>How did we do, {d.firstName}?</h1>
        <p style={{ ...ui.muted, fontSize: 14, marginTop: 6 }}>It only takes a minute — just tap the stars.</p>
      </div>

      {products.map(p => (
        <section key={p.id} style={ui.card}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {p.image ? <img src={p.image} alt="" style={styles.thumb} /> : <div style={styles.thumb} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
              <Stars value={p.rating} size={32} onChange={n => setProduct(p.id, 'rating', n)} label={`Rate ${p.name}`} />
            </div>
          </div>
          {p.rating > 0 && (
            <Field label="Tell others what you think (optional)" style={{ marginTop: 12 }}>
              <TextArea rows={3} value={p.body} onChange={e => setProduct(p.id, 'body', e.target.value)} placeholder="How do you like it?" />
            </Field>
          )}
        </section>
      ))}

      <section style={ui.card}>
        <h2 style={{ ...ui.h2, marginBottom: 4 }}>Your shopping experience</h2>
        <p style={{ ...ui.muted, marginBottom: 10 }}>Just for {BRAND.ownerFirstName} — this isn’t posted anywhere.</p>
        <Stars value={feedback.rating} size={32} onChange={n => setFeedback(f => ({ ...f, rating: n }))} label="Rate your shopping experience" />
        <Field label={d.products.length ? 'How was ordering from us? Anything we could do better?' : 'How was working with us? Anything we could do better?'} style={{ marginTop: 12 }}>
          <TextArea rows={3} value={feedback.body} onChange={e => setFeedback(f => ({ ...f, body: e.target.value }))} />
        </Field>
      </section>

      {rated.length > 0 && (
        <Field label="Name shown with your review"><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sheila H." /></Field>
      )}
      {formError && <div style={ui.error}>{formError}</div>}
      <Button block loading={busy} onClick={submit}>Send</Button>
      {rated.length > 0 && <p style={{ ...ui.hint, textAlign: 'center' }}>Product reviews appear in the shop with a “Verified buyer” tag.</p>}
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div style={{ ...ui.page, paddingBottom: 40 }}>
      <BrandHeader />
      <div style={{ ...ui.wrap, maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  )
}

const styles = {
  thumb: { width: 64, height: 64, borderRadius: 12, objectFit: 'cover', background: 'var(--card2)', flexShrink: 0 },
}
