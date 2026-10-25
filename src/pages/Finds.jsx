import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { BRAND, FINDS } from '../brand'
import { SiteHeader, SiteFooter } from '../components/SiteChrome'
import { ui, Loading } from '../components/ui'

// /finds — Create(L)ive(Ly) Finds: her Amazon favorites, presented as her own curated boutique: her photos, her words,
// and links back to what she makes with them. Checkout happens on Amazon (and the page says so).
export default function Finds() {
  const [finds, setFinds] = useState(null)
  const [params, setParams] = useSearchParams()
  const shelf = params.get('s') || 'all'

  useEffect(() => {
    document.title = `${FINDS.title} · ${BRAND.name}`
    api('get-finds').then(setFinds).catch(() => setFinds([]))
  }, [])

  if (!finds) return <Loading />
  const shelves = FINDS.shelves.filter(s => finds.some(f => f.shelf === s.key))
  const featured = shelf === 'all' ? finds.find(f => f.featured) : null
  const shown = finds.filter(f => (shelf === 'all' || f.shelf === shelf) && f !== featured)

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <SiteHeader />

      <section style={s.hero}>
        <div className="container" style={{ maxWidth: 760, textAlign: 'center', padding: '40px 20px 28px' }}>
          <div style={ui.eyebrow}>{FINDS.eyebrow}</div>
          <h1 style={{ ...ui.h1, fontSize: 'clamp(32px, 6vw, 46px)', marginTop: 8 }}>{FINDS.title}</h1>
          <p style={s.intro}>{FINDS.intro}</p>
          <div style={s.sig}>— {BRAND.ownerFirstName}</div>
        </div>
      </section>

      <main className="container" style={{ paddingTop: 18, paddingBottom: 10 }}>
        {finds.length === 0 ? (
          <div style={{ ...ui.card, textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 34 }}>🛍️</div>
            <h2 style={{ ...ui.h2, marginTop: 8 }}>My favorite finds are coming soon</h2>
            <p style={ui.muted}>In the meantime, <Link to="/shop/products">shop my studio →</Link></p>
          </div>
        ) : (
          <>
            {shelves.length > 1 && (
              <div className="scroll-x" style={s.shelves}>
                {[{ key: 'all', name: 'All finds' }, ...shelves].map(x => (
                  <button key={x.key} onClick={() => setParams(x.key === 'all' ? {} : { s: x.key }, { replace: true })}
                    style={{ ...s.shelf, ...(shelf === x.key ? s.shelfOn : {}) }}>{x.name}</button>
                ))}
              </div>
            )}

            {featured && <Featured f={featured} />}

            <div style={s.grid}>
              {shown.map(f => <FindCard key={f.id} f={f} />)}
            </div>

            <div style={s.studio}>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 600 }}>Love my picks? See what I make with them.</div>
              <p style={{ ...ui.muted, fontSize: 14, marginTop: 6 }}>Handmade stickers, 3D prints, custom gifts and keepsakes — made in my {BRAND.location} studio.</p>
              <Link to="/shop/products" style={s.studioBtn}>Shop my studio →</Link>
            </div>
          </>
        )}
        <p style={s.disclosure}>{FINDS.disclosure}</p>
      </main>
      <SiteFooter />
    </div>
  )
}

// Counts the tap without slowing the trip to Amazon.
const track = (id) => {
  try { navigator.sendBeacon('/api/track-find', new Blob([JSON.stringify({ id })], { type: 'application/json' })) } catch { /* ignore */ }
}

const AmazonLink = ({ f, style, children }) => (
  <a href={f.url} target="_blank" rel="sponsored nofollow noopener noreferrer" onClick={() => track(f.id)} style={style}>{children}</a>
)

const Badges = ({ f }) => (
  <div style={s.badges}>
    {f.badge && <span style={s.badge}>{f.badge}</span>}
    {f.popular && <span style={{ ...s.badge, background: 'var(--dark)' }}>🔥 Popular</span>}
  </div>
)

const PairsWith = ({ f }) => f.pairsWith && (
  <Link to={`/p/${f.pairsWith.id}`} style={s.pairs}>✨ I use this to make <strong>{f.pairsWith.name}</strong> →</Link>
)

function Featured({ f }) {
  return (
    <section style={s.featured} className="split">
      <AmazonLink f={f} style={{ display: 'block', position: 'relative' }}>
        {f.image ? <img src={f.image} alt={f.title} style={s.featuredImg} /> : <div style={{ ...s.featuredImg, ...s.noImg }}>🛍️</div>}
        <Badges f={f} />
      </AmazonLink>
      <div style={{ padding: 'clamp(4px, 2vw, 18px)' }}>
        <div style={ui.eyebrow}>If you only get one thing</div>
        <h2 style={{ ...ui.h1, fontSize: 'clamp(24px, 4vw, 32px)', marginTop: 8 }}>{f.title}</h2>
        {f.note && <p style={s.featuredNote}>“{f.note}”</p>}
        <div style={{ ...s.sig, textAlign: 'left', marginTop: 4 }}>— {BRAND.ownerFirstName}</div>
        <AmazonLink f={f} style={{ ...s.buy, display: 'inline-flex', marginTop: 18, padding: '14px 26px', fontSize: 15 }}>Get it on Amazon ↗</AmazonLink>
        <PairsWith f={f} />
      </div>
    </section>
  )
}

export function FindCard({ f }) {
  return (
    <article style={s.card}>
      <AmazonLink f={f} style={{ display: 'block', position: 'relative' }}>
        {f.image ? <img src={f.image} alt={f.title} loading="lazy" style={s.img} /> : <div style={{ ...s.img, ...s.noImg }}>🛍️</div>}
        <Badges f={f} />
      </AmazonLink>
      <div style={{ padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.35 }}>{f.title}</div>
        {f.note && <p style={s.note}>“{f.note}”</p>}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <AmazonLink f={f} style={s.buy}>Get it on Amazon ↗</AmazonLink>
          <PairsWith f={f} />
        </div>
      </div>
    </article>
  )
}

const s = {
  hero: { background: 'linear-gradient(180deg, var(--card2), var(--bg))', borderBottom: '1px solid var(--border)' },
  intro: { fontSize: 16, lineHeight: 1.7, color: 'var(--mid)', marginTop: 12 },
  sig: { fontFamily: "'Dancing Script', cursive", fontSize: 26, color: 'var(--primary)', marginTop: 6, textAlign: 'center' },
  shelves: { display: 'flex', gap: 8, padding: '4px 0 18px' },
  shelf: { padding: '9px 16px', borderRadius: 50, border: '1.5px solid var(--border)', background: 'var(--card)', fontSize: 13, fontWeight: 700, color: 'var(--mid)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  shelfOn: { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' },
  featured: { ...ui.card, padding: 'clamp(14px, 3vw, 24px)', marginBottom: 22, alignItems: 'center' },
  featuredImg: { width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 16, display: 'block', background: 'var(--card2)' },
  featuredNote: { fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontSize: 18, lineHeight: 1.6, color: 'var(--dark)', marginTop: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', gap: 14 },
  card: { ...ui.card, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  img: { width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block', background: 'var(--card2)' },
  noImg: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 },
  badges: { position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
  badge: { background: 'var(--primary)', color: '#fff', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', borderRadius: 6, padding: '4px 8px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' },
  note: { fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontSize: 13.5, lineHeight: 1.5, color: 'var(--mid)', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' },
  buy: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 8px', borderRadius: 50, background: 'linear-gradient(135deg, var(--accent), var(--primary))', color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '0.01em', whiteSpace: 'nowrap', textDecoration: 'none' },
  pairs: { display: 'block', fontSize: 12, color: 'var(--secondary)', textDecoration: 'none', lineHeight: 1.4, marginTop: 10 },
  studio: { ...ui.card, textAlign: 'center', marginTop: 28, background: 'var(--card2)' },
  studioBtn: { display: 'inline-block', marginTop: 14, padding: '12px 22px', borderRadius: 50, background: 'var(--dark)', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' },
  disclosure: { fontSize: 12, color: 'var(--muted)', textAlign: 'center', margin: '22px auto 0', maxWidth: 560, lineHeight: 1.6 },
}
