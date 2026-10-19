import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { BRAND, COLLECTIONS } from '../brand'

const LINKS = [
  { to: '/shop/products', label: 'Shop' },
  { to: '/#collections', label: 'Collections' },
  { to: '/#sticker-bar', label: 'Sticker Bar' },
  { to: '/#about', label: 'About' },
]

// Public website header: logo + links on desktop, menu button on phones.
export function SiteHeader() {
  const [open, setOpen] = useState(false)
  return (
    <header style={styles.header}>
      <div className="container" style={styles.bar}>
        <Link to="/" aria-label={`${BRAND.name} home`} onClick={() => setOpen(false)}>
          <img src={BRAND.logo} alt={BRAND.name} style={styles.logo} />
        </Link>
        <nav className="site-nav-links" style={styles.links}>
          {LINKS.map(l => l.to.includes('#')
            ? <Link key={l.to} to={l.to} style={styles.link({ isActive: false })}>{l.label}</Link>
            : <NavLink key={l.to} to={l.to} style={styles.link}>{l.label}</NavLink>)}
          <Link to="/custom" style={styles.cta}>Request a custom item</Link>
        </nav>
        <button className="site-menu-btn" onClick={() => setOpen(o => !o)} aria-label="Menu" aria-expanded={open} style={styles.menuBtn}>
          {open ? '✕' : '☰'}
        </button>
      </div>
      {open && (
        <nav className="site-mobile-menu" style={styles.mobileMenu} onClick={() => setOpen(false)}>
          {LINKS.map(l => <Link key={l.to} to={l.to} style={styles.mobileLink}>{l.label}</Link>)}
          <Link to="/custom" style={{ ...styles.cta, textAlign: 'center', marginTop: 8 }}>Request a custom item</Link>
        </nav>
      )}
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer style={styles.footer}>
      <div className="container grid-4" style={{ padding: '36px 20px 20px', alignItems: 'start' }}>
        <div>
          <img src={BRAND.logo} alt={BRAND.name} style={{ width: 170, height: 'auto' }} />
          <p style={styles.footText}>{BRAND.tagline}. {BRAND.location}.</p>
        </div>
        <div>
          <div style={styles.footHead}>Shop</div>
          <Link to="/shop/products" style={styles.footLink}>All products</Link>
          {COLLECTIONS.map(c => <Link key={c.key} to={`/shop/products?c=${c.key}`} style={styles.footLink}>{c.name}</Link>)}
        </div>
        <div>
          <div style={styles.footHead}>Custom</div>
          <Link to="/custom" style={styles.footLink}>Request a custom item</Link>
          <Link to="/custom?type=sticker-bar" style={styles.footLink}>Book the Sticker Bar</Link>
        </div>
        <div>
          <div style={styles.footHead}>Studio</div>
          <Link to="/#about" style={styles.footLink}>About</Link>
          {BRAND.instagram && <a href={BRAND.instagram} style={styles.footLink} target="_blank" rel="noreferrer">Instagram</a>}
          <Link to="/login" style={{ ...styles.footLink, opacity: 0.6 }}>Studio login</Link>
        </div>
      </div>
      <div className="container" style={styles.copy}>© {new Date().getFullYear()} {BRAND.name}</div>
    </footer>
  )
}

const styles = {
  header: { position: 'sticky', top: 0, zIndex: 100, background: 'rgba(255,250,249,0.92)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)' },
  bar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 },
  logo: { height: 48, width: 'auto', display: 'block' },
  links: { alignItems: 'center', gap: 26 },
  link: ({ isActive }) => ({ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: isActive ? 'var(--primary)' : 'var(--dark)', textDecoration: 'none' }),
  cta: { background: 'linear-gradient(135deg, var(--accent), var(--primary))', color: '#fff', padding: '11px 18px', borderRadius: 12, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none' },
  menuBtn: { background: 'none', border: '1px solid var(--border)', borderRadius: 10, width: 42, height: 42, fontSize: 18, cursor: 'pointer', alignItems: 'center', justifyContent: 'center', color: 'var(--dark)' },
  mobileMenu: { flexDirection: 'column', gap: 4, padding: '8px 20px 18px', borderTop: '1px solid var(--border)', background: 'var(--bg)' },
  mobileLink: { padding: '12px 0', fontSize: 15, fontWeight: 600, color: 'var(--dark)', textDecoration: 'none', borderBottom: '1px solid var(--border)' },
  footer: { borderTop: '1px solid var(--border)', background: 'var(--card2)', marginTop: 48 },
  footHead: { fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: 10 },
  footLink: { display: 'block', fontSize: 14, color: 'var(--mid)', textDecoration: 'none', padding: '4px 0' },
  footText: { fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, marginTop: 10 },
  copy: { fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', padding: '14px 20px 24px', borderTop: '1px solid var(--border)' },
}
