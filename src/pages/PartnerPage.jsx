import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { fmt } from '../lib/money'
import { REF_DAYS } from '../lib/affiliates'
import { BRAND } from '../brand'
import { ui, Button, BrandHeader, Loading, useFlash } from '../components/ui'

const STATE_LABEL = { pending: 'Pending — order not complete yet', ready: 'Earned — payment coming', paid: 'Paid ✓' }

// /partner/:token — a partner's own page: their links (shop + every product) and what they've earned.
export default function PartnerPage() {
  const { token } = useParams()
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [toast, flash] = useFlash()

  useEffect(() => { api(`get-partner?token=${encodeURIComponent(token)}`).then(setD).catch(e => setError(e.message)) }, [token])

  if (error) return <Shell><div style={{ ...ui.card, textAlign: 'center' }}>{error === 'Link not found' ? 'This partner link isn’t valid. Ask for a new one.' : error}</div></Shell>
  if (!d) return <Loading />

  const shopLink = `${d.siteUrl}/?ref=${d.code}`
  const share = async (url, msg) => {
    if (navigator.share) { try { await navigator.share({ url, title: d.business }); return } catch { /* cancelled — fall back to copying */ } }
    navigator.clipboard.writeText(url).then(() => flash(msg), () => flash('Copy failed', 'error'))
  }

  return (
    <Shell>
      {toast}
      <section style={ui.card}>
        <div style={ui.eyebrow}>{d.business} partner</div>
        <h1 style={{ ...ui.h1, fontSize: 26, marginTop: 4 }}>Hi {d.name.split(' ')[0]} 👋</h1>
        <p style={{ ...ui.muted, fontSize: 14, marginTop: 6 }}>
          You earn <strong>{d.rate}%</strong> of every purchase made through your links. {!d.active && <strong>Your link is paused right now.</strong>}
        </p>
        <div style={styles.linkBox}>
          <span style={styles.linkText}>{shopLink}</span>
          <Button small onClick={() => share(shopLink, 'Link copied')}>Share</Button>
        </div>
      </section>

      <section style={styles.stats}>
        <Stat n={d.clicks} label="Clicks" />
        <Stat n={d.totals.count} label="Sales" />
        <Stat n={fmt(d.totals.pending)} label="Pending" />
        <Stat n={fmt(d.totals.ready)} label="Earned" />
        <Stat n={fmt(d.totals.paid)} label="Paid to you" />
      </section>

      {d.products.length > 0 && (
        <section style={ui.card}>
          <h2 style={ui.h2}>Share a product</h2>
          {d.products.map(p => (
            <div key={p.id} style={styles.product}>
              {p.image ? <img src={p.image} alt="" style={styles.thumb} /> : <div style={styles.thumb} />}
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600 }}>{p.name}</span>
              <Button small variant="ghost" onClick={() => share(`${d.siteUrl}/p/${p.id}?ref=${d.code}`, `${p.name} link copied`)}>Share</Button>
            </div>
          ))}
        </section>
      )}

      <section style={ui.card}>
        <h2 style={ui.h2}>Your sales</h2>
        {d.sales.length === 0 ? <p style={ui.muted}>No sales yet — share your link to get started!</p> : d.sales.map((s, i) => (
          <div key={i} style={styles.row}>
            <span>{new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: BRAND.timezone })}<div style={ui.muted}>{STATE_LABEL[s.state]}</div></span>
            <strong>{fmt(s.amount)}</strong>
          </div>
        ))}
        {d.payouts.length > 0 && (
          <>
            <div style={{ ...ui.label, marginTop: 16 }}>Payments to you</div>
            {d.payouts.map((p, i) => (
              <div key={i} style={styles.row}>
                <span>{new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: BRAND.timezone })}</span>
                <strong style={{ color: 'var(--success)' }}>{fmt(p.amount)}</strong>
              </div>
            ))}
          </>
        )}
      </section>

      <p style={{ ...ui.muted, fontSize: 12, lineHeight: 1.6, textAlign: 'center' }}>
        Your links never expire. Anyone who taps one is credited to you for {REF_DAYS} days, even if they come back later to buy. You earn on items after discounts (not shipping).
        Earnings are paid once an order is complete; refunded orders don’t count. Keep this page private — it’s just for you.
      </p>
    </Shell>
  )
}

const Stat = ({ n, label }) => (
  <div style={styles.stat}>
    <div style={{ fontWeight: 800, fontSize: 17 }}>{n}</div>
    <div style={styles.statLabel}>{label}</div>
  </div>
)

function Shell({ children }) {
  return (
    <div style={{ ...ui.page, paddingBottom: 40 }}>
      <BrandHeader subtitle="Partner page" />
      <div style={{ ...ui.wrap, maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  )
}

const styles = {
  linkBox: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '10px 12px', borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--border)' },
  linkText: { flex: 1, minWidth: 0, fontSize: 13, color: 'var(--mid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 },
  stat: { ...ui.card, padding: '10px 12px' },
  statLabel: { fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 },
  product: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' },
  thumb: { width: 44, height: 44, borderRadius: 8, objectFit: 'cover', background: 'var(--card2)', flexShrink: 0 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 },
}
