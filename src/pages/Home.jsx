import { useEffect } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { BRAND, COLLECTIONS, SITE, STICKER_BAR } from '../brand'
import { SiteHeader, SiteFooter } from '../components/SiteChrome'

// Public website homepage. The custom order form lives at /custom and is only reached
// from the "Request a custom item" / "Book the Sticker Bar" buttons.
export default function Home() {
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // Old links pointed at /?type=sticker-bar (the form used to live here).
  useEffect(() => {
    if (params.get('type')) navigate(`/custom?type=${encodeURIComponent(params.get('type'))}`, { replace: true })
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
          {COLLECTIONS.map(c => (
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

      {/* Custom orders + Sticker Bar */}
      <section className="container grid-2" style={{ paddingTop: 48 }}>
        <div id="custom" style={s.feature}>
          <div style={s.tileKicker}>Made just for you</div>
          <h2 style={{ ...s.h2, marginTop: 8 }}>Custom orders</h2>
          <p style={s.featureText}>
            Personalized gifts, keepsakes, 3D prints, brand merch and vendor essentials designed around your idea.
            Tell us what you're dreaming up, share any artwork, and we'll send a personalized quote. No payment until you approve it.
          </p>
          <ol style={s.steps}>
            <li>Share your idea & files</li>
            <li>Review and sign your quote</li>
            <li>Approve your proof</li>
            <li>We create it with care</li>
          </ol>
          <Link to="/custom" style={s.btnPink}>Request a custom item →</Link>
        </div>
        <div id="sticker-bar" style={{ ...s.feature, background: 'linear-gradient(160deg, var(--card2), #fff)', scrollMarginTop: 80 }}>
          <div style={s.tileKicker}>Events & experiences</div>
          <h2 style={{ ...s.h2, marginTop: 8 }}>The Sticker Bar</h2>
          <p style={s.featureText}>{STICKER_BAR.blurb} Guests build their own creations to take home, and we bring everything and handle setup.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '4px 0 20px' }}>
            {STICKER_BAR.eventTypes.filter(t => t !== 'Other').map(t => <span key={t} style={s.badge}>{t}</span>)}
          </div>
          <Link to="/custom?type=sticker-bar" style={s.btnPink}>Book the Sticker Bar →</Link>
        </div>
      </section>

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
  about: { borderRadius: 22, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.75)', padding: '28px 26px' },
}
