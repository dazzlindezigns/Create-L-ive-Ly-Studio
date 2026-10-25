import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { BRAND, COLLECTIONS, PARTNERS, SITE, STICKER_BAR, FINDS } from '../brand'
import { FindCard } from './Finds'
import { SiteHeader, SiteFooter } from '../components/SiteChrome'
import { api } from '../lib/api'
import { fmt } from '../lib/money'
import { tiersFromSettings, offersDigital } from '../lib/cart'

// Public website homepage. The custom order form lives at /custom and is only reached
// from the "Request a custom item" buttons.
export default function Home() {
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [sheets, setSheets] = useState([])
  const [finds, setFinds] = useState([])
  const [tiers, setTiers] = useState(() => tiersFromSettings())

  // Live Sticker Bar sheets + her current Stack & Save tiers (falls back to the mockups below).
  useEffect(() => {
    api('get-products').then(p => {
      // Full rows of three; with fewer than three live sheets the mockups show instead.
      const live = p.filter(x => x.collection === STICKER_BAR.collection)
      setSheets(live.slice(0, live.length >= 6 ? 6 : live.length >= 3 ? 3 : 0))
    }).catch(() => {})
    api('get-settings').then(s => setTiers(tiersFromSettings(s))).catch(() => {})
    api('get-finds').then(setFinds).catch(() => {})
  }, [])

  // Old links: /?type=… (the form used to live here) and /?type=sticker-bar (now the sticker sheet shop).
  useEffect(() => {
    const type = params.get('type')
    if (!type) return
    navigate(type === 'sticker-bar' ? `/shop/products?c=${STICKER_BAR.collection}` : `/custom?type=${encodeURIComponent(type)}`, { replace: true })
  }, [params, navigate])

  // Header links like /#about scroll to that section.
  useEffect(() => {
    if (!location.hash) { window.scrollTo(0, 0); return }
    const el = document.getElementById(location.hash.slice(1))
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }, [location.hash])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <SiteHeader />

      {/* Hero */}
      <section className="container hero-grid" style={{ paddingTop: 32, paddingBottom: 24 }}>
        <div>
          <div style={s.kicker}>{BRAND.subTagline}</div>
          <h1 style={s.h1}>{SITE.heroTitle} <span style={s.accent}>{SITE.heroAccent}</span></h1>
          <p style={s.lead}>{SITE.heroIntro}</p>
          <div style={s.ctaRow}>
            <Link to="/shop/products" style={s.btnPink}>Shop all products →</Link>
            <Link to="/custom" style={s.btnGhost}>Request a custom item</Link>
          </div>
          <div style={s.badges}>
            {SITE.badges.map(b => <span key={b} style={s.badge}>{b}</span>)}
          </div>
        </div>
        <div style={s.heroImgWrap}>
          <img src={SITE.heroImage} alt={`${BRAND.name} custom creations`} style={s.heroImg} fetchpriority="high" />
        </div>
      </section>

      {/* Collections */}
      <section id="collections" className="container" style={{ paddingTop: 40, scrollMarginTop: 80 }}>
        <div style={s.sectionHead}>
          <h2 style={s.h2}>Shop by Studio</h2>
          <span style={s.hint}>Your destination for all things custom</span>
        </div>
        <div className="grid-2">
          {COLLECTIONS.filter(c => !c.featured).map(c => (
            <Link key={c.key} to={`/shop/products?c=${c.key}`} style={s.tile}>
              <div style={s.thumb}><img src={c.image} alt={`${BRAND.name} ${c.name}`} loading="lazy" style={s.thumbImg} /></div>
              <div style={{ padding: '20px 22px 24px' }}>
                <div style={s.tileKicker}>{BRAND.name}</div>
                <div style={s.tileName}>{c.name}</div>
                <p style={s.tileDesc}>{c.description}</p>
                <div style={s.go}>Shop {c.name} →</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Sticker Bar — her sticker-sheet line */}
      <section id="sticker-bar" className="container" style={{ paddingTop: 48, scrollMarginTop: 80 }}>
        <div style={s.stickerWrap}>
          <div className="split">
            <div>
              <img src={STICKER_BAR.logo} alt={`${BRAND.shortName} ${STICKER_BAR.name} — ${STICKER_BAR.tagline}`} style={{ width: 'min(380px, 100%)', height: 'auto', display: 'block' }} />
              <div style={{ ...s.tileKicker, marginTop: 18 }}>{STICKER_BAR.motto}</div>
              <h2 style={{ ...s.h2, marginTop: 8 }}>{STICKER_BAR.headline}</h2>
              <p style={s.featureText}>{STICKER_BAR.intro}</p>
              <div style={s.tierRow}>
                <span style={{ ...s.tileKicker, alignSelf: 'center' }}>Stack & save</span>
                {tiers.slice().reverse().map(t => (
                  <span key={t.min} style={s.tier}><strong>{t.min}+</strong> {t.pct}% off</span>
                ))}
              </div>
              <div style={s.ctaRow}>
                <Link to={`/shop/products?c=${STICKER_BAR.collection}`} style={s.btnPink}>Shop the sheets →</Link>
                <Link to="/shop/products?c=digital" style={s.btnGhost}>Digital downloads</Link>
              </div>
            </div>
            <div style={s.sheetGrid}>
              {(sheets.length ? sheets : STICKER_BAR.showcase.map(src => ({ src }))).map(x => x.id ? (
                <Link key={x.id} to={`/shop/products?c=${STICKER_BAR.collection}&p=${x.id}`} style={s.sheet}>
                  <img src={x.image_urls?.[0] || STICKER_BAR.logo} alt={`${x.name} sticker sheet`} loading="lazy" style={s.sheetImg} />
                  {x.badge && <span style={s.sheetBadge}>{x.badge}</span>}
                  <span style={s.sheetName}>{x.name}<br /><span style={{ color: 'var(--primary)' }}>from {fmt(offersDigital(x) && x.digital_price != null ? Math.min(x.price, x.digital_price) : x.price)}</span></span>
                </Link>
              ) : (
                <div key={x.src} style={s.sheet}><img src={x.src} alt="Sticker Bar sticker sheet" loading="lazy" style={s.sheetImg} /></div>
              ))}
            </div>
          </div>
          <div className="grid-3" style={{ marginTop: 28 }}>
            {STICKER_BAR.perks.map(([icon, title, text]) => (
              <div key={title} style={s.perk}>
                <div style={{ fontSize: 22 }}>{icon}</div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>{title}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, marginTop: 4 }}>{text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Custom orders */}
      <section id="custom" className="container" style={{ paddingTop: 48, scrollMarginTop: 80 }}>
        <div style={s.feature} className="split">
          <div>
            <div style={s.tileKicker}>Made just for you</div>
            <h2 style={{ ...s.h2, marginTop: 8 }}>Custom orders</h2>
            <p style={s.featureText}>
              Personalized gifts, keepsakes, 3D prints, brand merch, custom stickers and vendor essentials designed around your idea.
              Tell us what you're dreaming up, share any artwork, and we'll send a personalized quote. No payment until you approve it.
            </p>
            <Link to="/custom" style={s.btnPink}>Request a custom item →</Link>
          </div>
          <ol style={s.steps}>
            <li>Share your idea & files</li>
            <li>Review and sign your quote</li>
            <li>Approve your proof</li>
            <li>We create it with care</li>
          </ol>
        </div>
      </section>

      {/* Create(L)ive(Ly) Finds teaser — featured picks first; hidden until she adds some */}
      {finds.length > 0 && (
        <section id="finds" className="container" style={{ paddingTop: 48, scrollMarginTop: 80 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <div style={s.tileKicker}>{FINDS.eyebrow}</div>
              <h2 style={{ ...s.h2, marginTop: 8 }}>{FINDS.title}</h2>
              <p style={{ ...s.featureText, marginTop: 6 }}>The tools and treasures I actually use and love.</p>
            </div>
            <Link to="/finds" style={s.btnPink}>See all finds →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', gap: 14 }}>
            {[...finds].sort((a, b) => (b.featured - a.featured)).slice(0, 4).map(f => <FindCard key={f.id} f={f} />)}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 12 }}>{FINDS.disclosure}</p>
        </section>
      )}

      {/* Recommended communities (affiliate) */}
      {PARTNERS.map(p => (
        <section key={p.key} id={p.key} className="container" style={{ paddingTop: 48, scrollMarginTop: 80 }}>
          <div style={s.partner} className="split">
            <img src={p.image} alt={p.imageAlt} loading="lazy" style={s.partnerImg} />
            <div style={{ padding: 'clamp(4px, 2vw, 16px)' }}>
              <div style={s.tileKicker}>Community we love</div>
              <h2 style={{ ...s.h2, marginTop: 8, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{p.name}</h2>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 10 }}>{p.kicker}</div>
              <p style={s.featureText}>{p.description}</p>
              <p style={s.disclosure}>{p.disclosure}</p>
              <a href={p.url} target="_blank" rel="sponsored noopener noreferrer" style={{ ...s.btnPink, marginTop: 8 }}>{p.cta} ↗</a>
            </div>
          </div>
        </section>
      ))}

      {/* About */}
      <section id="about" className="container" style={{ paddingTop: 48, scrollMarginTop: 80 }}>
        <div style={s.about}>
          <h2 style={s.h2}>About {BRAND.name}</h2>
          <p style={s.featureText}>{SITE.about}</p>
          <p style={s.featureText}>
            From custom keepsakes and innovative 3D prints to digital papers, vendor essentials, and empowering merchandise,
            we're here to help you create, celebrate, and inspire. Based in {BRAND.location}.
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}

const s = {
  kicker: { fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 },
  h1: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(34px, 5vw, 54px)', fontWeight: 600, lineHeight: 1.1, margin: '14px 0 0', letterSpacing: '-0.01em' },
  accent: { background: 'linear-gradient(90deg, var(--secondary), var(--primary), var(--accent))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' },
  lead: { fontSize: 15, lineHeight: 1.9, color: 'var(--muted)', marginTop: 16, maxWidth: 560 },
  ctaRow: { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  btnPink: { display: 'inline-flex', alignItems: 'center', background: 'linear-gradient(135deg, var(--accent), var(--primary))', color: '#fff', padding: '14px 20px', borderRadius: 13, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none' },
  btnGhost: { display: 'inline-flex', alignItems: 'center', background: '#fff', color: 'var(--dark)', border: '1px solid var(--border)', padding: '14px 20px', borderRadius: 13, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none' },
  badges: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 22 },
  badge: { padding: '8px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--primary)' },
  heroImgWrap: { borderRadius: 22, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 18px 45px rgba(148,82,103,0.12)', background: '#FFF8F0' },
  heroImg: { width: '100%', height: 'auto', display: 'block' },
  sectionHead: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  h2: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 30, fontWeight: 600 },
  hint: { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' },
  tile: { display: 'block', borderRadius: 22, overflow: 'hidden', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.9)', boxShadow: '0 12px 35px rgba(148,82,103,0.06)', textDecoration: 'none', color: 'inherit' },
  thumb: { aspectRatio: '2 / 1', overflow: 'hidden', background: '#FFF8F0', borderBottom: '1px solid var(--border)' },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  tileKicker: { fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--primary)' },
  tileName: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 600, marginTop: 8 },
  tileDesc: { fontSize: 14, lineHeight: 1.8, color: 'var(--muted)', marginTop: 10 },
  go: { marginTop: 16, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--primary)' },
  feature: { borderRadius: 22, border: '1px solid var(--border)', background: '#fff', padding: '28px 26px', boxShadow: '0 12px 35px rgba(148,82,103,0.06)' },
  featureText: { fontSize: 14, lineHeight: 1.9, color: 'var(--muted)', margin: '12px 0 16px' },
  steps: { paddingLeft: 20, margin: '0 0 22px', fontSize: 14, lineHeight: 2, color: 'var(--dark)' },
  stickerWrap: { borderRadius: 26, border: '1px solid var(--border)', background: 'linear-gradient(160deg, var(--card2), #fff 60%)', padding: 'clamp(22px, 4vw, 40px)', boxShadow: '0 12px 35px rgba(148,82,103,0.06)' },
  tierRow: { display: 'flex', flexWrap: 'wrap', gap: 8, margin: '4px 0 6px' },
  tier: { padding: '8px 12px', borderRadius: 12, background: '#fff', border: '1px solid var(--border)', fontSize: 13, color: 'var(--dark)' },
  sheetGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 },
  sheet: { position: 'relative', display: 'block', borderRadius: 14, overflow: 'hidden', background: '#fff', border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--dark)' },
  sheetImg: { width: '100%', aspectRatio: '2 / 3', objectFit: 'cover', display: 'block' },
  sheetBadge: { position: 'absolute', top: 6, left: 6, background: 'var(--primary)', color: '#fff', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '3px 7px', borderRadius: 20 },
  sheetName: { display: 'block', padding: '6px 8px 8px', fontSize: 11, fontWeight: 700, lineHeight: 1.35 },
  perk: { background: 'rgba(255,255,255,0.85)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 18px' },
  partner: { borderRadius: 22, border: '1px solid var(--border)', background: '#fff', padding: 'clamp(16px, 3vw, 28px)', boxShadow: '0 12px 35px rgba(148,82,103,0.06)' },
  partnerImg: { width: '100%', maxWidth: 400, height: 'auto', display: 'block', margin: '0 auto', borderRadius: 16 },
  disclosure: { fontSize: 13, fontStyle: 'italic', color: 'var(--muted)', lineHeight: 1.7, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '12px 0', margin: '4px 0 18px' },
  about: { borderRadius: 22, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.75)', padding: '28px 26px' },
}
