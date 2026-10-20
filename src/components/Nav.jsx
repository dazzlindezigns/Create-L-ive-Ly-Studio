import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { BRAND } from '../brand'
import { supabase } from '../lib/supabase'
import { usePush } from '../lib/push'
import { useInstallState } from '../lib/pwa'
import { Modal, Button } from './ui'

// ── Inline SVG icons — no emoji, consistent cross-platform rendering ──
const Svg = ({ size = 22, color, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color || 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)
const IconOrders   = (p) => <Svg {...p}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></Svg>
const IconProducts = (p) => <Svg {...p}><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></Svg>
const IconCalc     = (p) => <Svg {...p}><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/></Svg>
const IconInbox    = (p) => <Svg {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></Svg>
export const IconExternal = (p) => <Svg {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></Svg>

const LINKS = [
  { path: '/dashboard', label: 'Orders', Icon: IconOrders },
  { path: '/dashboard/inbox', label: 'Inbox', Icon: IconInbox, badge: 'inbox' },
  { path: '/dashboard/products', label: 'Shop', Icon: IconProducts },
  { path: '/dashboard/calculator', label: 'Calculator', short: 'Quote', Icon: IconCalc },
]

// Unread customer replies + emails that didn't arrive, kept live for the Inbox badge.
function useUnread() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const load = () => supabase.from('email_log').select('id', { count: 'exact', head: true })
      .is('read_at', null).or('direction.eq.in,status.in.(bounced,complained,failed)').then(({ count }) => setN(count || 0))
    load()
    const ch = supabase.channel('nav-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_log' }, load).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])
  return n
}

// Small links under "Sign out": notifications + install. Notifications switch on by themselves
// once allowed; these only show when something needs one tap.
export function AppLinks({ align = 'left' }) {
  const { state, enable } = usePush()
  const { mode, install } = useInstallState()
  const [help, setHelp] = useState(null)
  const links = []
  if (state === 'off') links.push(['🔔 Turn on notifications', enable])
  else if (state === 'on') links.push(['🔔 Notifications on', null])
  else if (state === 'blocked') links.push(['🔕 Notifications blocked', () => setHelp('blocked')])
  else if (state === 'install') links.push(['🔔 Notifications: install app', () => setHelp('ios')])
  else if (state === 'setup') links.push(['🔕 Notifications not set up', () => setHelp('setup')])
  if (mode !== 'installed' && state !== 'install') {
    links.push(['⬇ Install app', mode === 'prompt' ? install : () => setHelp(mode === 'ios' ? 'ios' : 'manual')])
  }
  if (!links.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start', gap: 2 }}>
      {links.map(([label, onClick]) => onClick
        ? <button key={label} onClick={onClick} style={s.miniLink}>{label}</button>
        : <span key={label} style={{ ...s.miniLink, cursor: 'default', textDecoration: 'none' }}>{label}</span>)}
      {help && <AppHelp kind={help} onClose={() => setHelp(null)} />}
    </div>
  )
}

function AppHelp({ kind, onClose }) {
  const content = {
    ios: ['Install the studio app', ['Open this page in Safari.', 'Tap Share (square with an arrow) → “Add to Home Screen” → Add.', `Open the ${BRAND.shortName} icon and sign in. Then tap “Turn on notifications”.`]],
    manual: ['Install the studio app', [`Computer (Chrome/Edge): click the install icon at the right of the address bar, or ⋮ → “Install ${BRAND.shortName}”.`, 'Android: ⋮ menu → “Install app”.']],
    blocked: ['Notifications are blocked', ['iPhone: Settings → Notifications → ' + BRAND.shortName + ' → Allow.', 'Computer: click the icon left of the address bar → Notifications → Allow, then reload.']],
    setup: ['Notifications aren’t set up yet', ['The server is missing its push keys (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT in Vercel).', 'Open /api/health to check, add the keys, then redeploy.']],
  }[kind]
  return (
    <Modal title={content[0]} onClose={onClose}>
      <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 15, lineHeight: 1.6 }}>
        {content[1].map((x, i) => <li key={i}>{x}</li>)}
      </ol>
      <Button block onClick={onClose} style={{ marginTop: 16 }}>Got it</Button>
    </Modal>
  )
}

// Admin navigation: sidebar on desktop (CSS .admin-sidebar), bottom tab bar on phones,
// and a slim "← Back" top bar on detail pages. Adds body.admin-layout so the page shifts right on desktop.
export default function Nav({ back, backLabel }) {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    document.body.classList.add('admin-layout')
    return () => document.body.classList.remove('admin-layout')
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const isActive = (path) => path === '/dashboard'
    ? location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/order')
    : location.pathname === path
  const go = (l) => navigate(l.path)
  const unread = useUnread()
  const badgeFor = (l) => l.badge === 'inbox' && unread > 0 ? unread : 0

  const sidebar = (
    <aside className="admin-sidebar no-print" style={s.sidebar}>
      <img src={BRAND.logo} alt={BRAND.name} style={{ width: 160, height: 'auto', margin: '6px auto 22px', display: 'block' }} />
      {LINKS.map(l => {
        const active = isActive(l.path)
        return (
          <button key={l.path} onClick={() => go(l)} style={{ ...s.sideLink, ...(active ? s.sideLinkOn : {}) }}>
            <l.Icon size={19} color={active ? 'var(--primary)' : 'var(--muted)'} /> {l.label}
            {badgeFor(l) > 0 && <span style={s.badge}>{badgeFor(l)}</span>}
          </button>
        )
      })}
      <a href="/" target="_blank" rel="noreferrer" style={{ ...s.sideLink, textDecoration: 'none' }}>
        <IconExternal size={19} color="var(--muted)" /> View website
      </a>
      <div style={{ flex: 1 }} />
      <button onClick={signOut} style={{ ...s.sideLink, color: 'var(--muted)' }}>Sign out</button>
      <div style={{ padding: '0 12px 6px' }}><AppLinks /></div>
    </aside>
  )

  if (back) {
    return (
      <>
        {sidebar}
        <nav style={s.topBar} className="no-print">
          <button style={s.topBack} onClick={() => navigate(back)}>← {backLabel || 'Back'}</button>
          <button style={s.topSignOut} onClick={signOut}>Sign out</button>
        </nav>
      </>
    )
  }

  const tab = (l) => {
    const active = isActive(l.path)
    const color = active ? 'var(--primary)' : '#A8999F'
    return (
      <button key={l.path} style={s.tab} onClick={() => go(l)}>
        <span style={{ position: 'relative' }}>
          <l.Icon color={color} />
          {badgeFor(l) > 0 && <span style={{ ...s.badge, position: 'absolute', top: -6, right: -12 }}>{badgeFor(l)}</span>}
        </span>
        <span style={{ ...s.tabLabel, color }}>{l.short || l.label}</span>
        {active && <div style={s.activeDot} />}
      </button>
    )
  }

  return (
    <>
      {sidebar}
      <nav style={s.bottomNav} className="admin-bottom-nav no-print">
        {LINKS.map(tab)}
      </nav>
    </>
  )
}

const s = {
  sidebar: {
    position: 'fixed', top: 0, left: 0, bottom: 0, width: 232, zIndex: 120, flexDirection: 'column', gap: 4,
    background: 'var(--card)', borderRight: '1px solid var(--border)', padding: '20px 14px',
  },
  sideLink: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 'none',
    borderRadius: 10, padding: '11px 12px', fontSize: 14, fontWeight: 600, color: 'var(--dark)', cursor: 'pointer',
  },
  sideLinkOn: { background: 'var(--card2)', color: 'var(--primary)' },
  topBar: {
    position: 'sticky', top: 0, zIndex: 100, background: 'var(--card)', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 52,
  },
  topBack: { fontSize: 14, fontWeight: 600, color: 'var(--mid)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0' },
  topSignOut: { fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 20, padding: '5px 12px', cursor: 'pointer' },
  bottomNav: {
    position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--card)', borderTop: '1px solid var(--border)',
    display: 'flex', alignItems: 'flex-end', paddingBottom: 'env(safe-area-inset-bottom)', zIndex: 100,
  },
  tab: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none',
    cursor: 'pointer', padding: '10px 4px 14px', WebkitTapHighlightColor: 'transparent', position: 'relative', minWidth: 0,
  },
  tabLabel: { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' },
  activeDot: { position: 'absolute', bottom: 6, width: 4, height: 4, borderRadius: '50%', background: 'var(--primary)' },
  badge: { marginLeft: 'auto', background: 'var(--primary)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 800, padding: '1px 6px', lineHeight: '14px' },
  miniLink: { background: 'none', border: 'none', padding: '3px 0', fontSize: 12, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, textAlign: 'inherit' },
}
