import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { BRAND } from '../brand'
import { ui, Button, TextArea, Loading, BrandHeader } from '../components/ui'

export default function ProofReview() {
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState(null) // null | 'changes'
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null) // 'approved' | 'changes'
  const [zoom, setZoom] = useState(null)

  useEffect(() => {
    api(`get-order?id=${encodeURIComponent(orderId)}`).then(setOrder).catch(e => setError(e.message))
  }, [orderId])

  const respond = async (action) => {
    setBusy(true); setError('')
    try {
      await api('proof-response', { body: { orderId, action, note } })
      setDone(action)
      window.scrollTo(0, 0)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (!order && !error) return <Loading />
  if (!order) return <Shell><div style={{ ...ui.card, textAlign: 'center' }}>This link is invalid or has expired.</div></Shell>

  const firstName = (order.customer_name || '').split(' ')[0]
  const items = order.proof_items?.length ? order.proof_items : (order.proof_urls || []).map(url => ({ url }))

  if (done || order.proof_status === 'approved' || order.proof_status === 'changes_requested') {
    const approved = done ? done === 'approved' : order.proof_status === 'approved'
    return (
      <Shell>
        <div style={{ ...ui.card, textAlign: 'center', padding: '34px 22px' }}>
          <div style={{ fontSize: 44 }}>{approved ? '🎉' : '✏️'}</div>
          <h1 style={{ ...ui.h1, fontSize: 24, margin: '8px 0' }}>{approved ? 'Proof approved!' : 'Changes sent!'}</h1>
          <p style={{ color: 'var(--mid)', lineHeight: 1.6 }}>
            {approved
              ? `Thank you, ${firstName}! Your order is heading into production. We'll let you know when it's ready.`
              : `Thanks, ${firstName}! We'll make your changes and send an updated proof soon.`}
          </p>
        </div>
      </Shell>
    )
  }

  if (!items.length || order.proof_status !== 'sent') {
    return <Shell><div style={{ ...ui.card, textAlign: 'center' }}>Your proof isn't ready yet — we'll email you when it is.</div></Shell>
  }

  return (
    <Shell>
      <div style={ui.card}>
        <div style={ui.eyebrow}>Proof review · {order.product_type}</div>
        <h1 style={{ ...ui.h1, fontSize: 24, margin: '6px 0' }}>Hey {firstName}, your proof is ready!</h1>
        <p style={{ color: 'var(--mid)', fontSize: 14, lineHeight: 1.6 }}>
          Check spelling, colors, size and placement. Production starts as soon as you approve.
        </p>
        {order.proof_note && (
          <div style={styles.note}>
            <div style={{ ...ui.eyebrow, marginBottom: 4 }}>Note from {BRAND.ownerFirstName}</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{order.proof_note}</div>
          </div>
        )}
      </div>

      {items.map((it, i) => (
        <div key={i} style={{ ...ui.card, padding: 12 }}>
          {it.label && <div style={{ ...ui.eyebrow, margin: '4px 4px 10px' }}>{it.label}</div>}
          {/\.pdf($|\?)/i.test(it.url)
            ? <a href={it.url} target="_blank" rel="noreferrer"><Button block variant="secondary">Open PDF proof ↗</Button></a>
            : <img src={it.url} alt={it.label || `Proof ${i + 1}`} onClick={() => setZoom(it.url)} style={styles.img} />}
        </div>
      ))}

      <div style={ui.card}>
        {mode === 'changes' ? (
          <>
            <h2 style={ui.h2}>What should we change?</h2>
            <TextArea autoFocus value={note} onChange={e => setNote(e.target.value)}
              placeholder="Be as specific as you can — e.g. 'Make the text bigger and change the pink to a lighter shade.'" />
            {error && <div style={{ ...ui.error, marginTop: 10 }}>{error}</div>}
            <Button block loading={busy} disabled={!note.trim()} onClick={() => respond('changes')} style={{ marginTop: 12 }}>Send my changes</Button>
            <Button block variant="ghost" onClick={() => setMode(null)} style={{ marginTop: 8 }}>Back</Button>
          </>
        ) : (
          <>
            {error && <div style={{ ...ui.error, marginBottom: 10 }}>{error}</div>}
            <Button block variant="gradient" loading={busy} onClick={() => respond('approved')} style={{ padding: 17 }}>
              ✓ Approve — looks perfect!
            </Button>
            <Button block variant="ghost" onClick={() => setMode('changes')} style={{ marginTop: 10 }}>Request changes</Button>
            {order.revision_history?.length > 0 && (
              <p style={{ ...ui.muted, textAlign: 'center', marginTop: 10, fontSize: 12 }}>Revision round {order.revision_history.length + 1}</p>
            )}
          </>
        )}
      </div>

      {zoom && (
        <div onClick={() => setZoom(null)} style={styles.zoom}>
          <img src={zoom} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}
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
  note: { background: 'var(--card2)', borderRadius: 12, padding: 14, marginTop: 14, fontSize: 14, lineHeight: 1.6 },
  img: { width: '100%', borderRadius: 10, display: 'block', cursor: 'zoom-in', background: 'repeating-conic-gradient(#f3f0f5 0% 25%, #fff 0% 50%) 50% / 20px 20px' },
  zoom: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'zoom-out' },
}
