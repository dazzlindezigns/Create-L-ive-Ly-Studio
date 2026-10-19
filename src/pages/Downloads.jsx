import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { BRAND } from '../brand'
import { ui, Button, Loading, BrandHeader } from '../components/ui'

// Customer download page for digital purchases. Every visit mints fresh signed links,
// so the emailed URL keeps working even after individual file links expire.
export default function Downloads() {
  const { orderId } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`get-downloads?id=${encodeURIComponent(orderId)}`).then(setData).catch(e => setError(e.message))
  }, [orderId])

  if (!data && !error) return <Loading />

  return (
    <div style={{ ...ui.page, paddingBottom: 40 }}>
      <BrandHeader />
      <div style={{ ...ui.wrap, maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error ? (
          <div style={{ ...ui.card, textAlign: 'center' }}>{error === 'Order not found' ? 'This link is invalid or has expired.' : error}</div>
        ) : !data.paid ? (
          <div style={{ ...ui.card, textAlign: 'center' }}>
            <div style={{ fontSize: 36 }}>⏳</div>
            <h1 style={{ ...ui.h1, fontSize: 22, margin: '8px 0' }}>Almost there!</h1>
            <p style={{ color: 'var(--mid)', lineHeight: 1.6 }}>Your downloads unlock as soon as payment is confirmed. This usually takes a few seconds — refresh this page in a moment.</p>
            <Button variant="ghost" onClick={() => window.location.reload()} style={{ marginTop: 14 }}>Refresh</Button>
          </div>
        ) : (
          <>
            <div style={{ ...ui.card, textAlign: 'center' }}>
              <div style={{ fontSize: 36 }}>✨</div>
              <h1 style={{ ...ui.h1, fontSize: 24, margin: '8px 0 4px' }}>Your downloads</h1>
              <p style={ui.muted}>Thank you, {(data.customerName || '').split(' ')[0]}! Tap each file to save it.</p>
            </div>
            {data.items.map((it, i) => (
              <div key={i} style={{ ...ui.card, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={styles.icon}>{(it.fileName || '').split('.').pop().toUpperCase().slice(0, 4) || 'FILE'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{it.name}</div>
                  <div style={{ ...ui.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.fileName}</div>
                </div>
                {it.url
                  ? <a href={it.url} style={{ textDecoration: 'none' }}><Button small>Download</Button></a>
                  : <span style={{ ...ui.hint, color: 'var(--danger)' }}>{it.error}</span>}
              </div>
            ))}
            <p style={{ ...ui.muted, textAlign: 'center', fontSize: 12, lineHeight: 1.6 }}>
              Links on this page expire after {data.expiresInHours} hours — just reopen this page (or the link in your email) to get fresh ones.
              On iPhone, files save to the Files app.
            </p>
          </>
        )}
        <p style={{ ...ui.muted, textAlign: 'center', fontSize: 12 }}>
          <Link to="/shop/products">Back to the shop</Link> · {BRAND.name}
        </p>
      </div>
    </div>
  )
}

const styles = {
  icon: { width: 48, height: 48, borderRadius: 12, background: 'var(--card2)', color: 'var(--primary)', fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
}
