import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
const IconForm     = (p) => <Svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></Svg>

export default function Nav({ back, backLabel }) {
  const navigate = useNavigate()
  const location = useLocation()

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (back) {
    return (
      <nav style={s.topBar} className="no-print">
        <button style={s.topBack} onClick={() => navigate(back)}>← {backLabel || 'Back'}</button>
        <button style={s.topSignOut} onClick={signOut}>Sign out</button>
      </nav>
    )
  }

  // Two tabs each side keeps the FAB centered.
  const left = [
    { path: '/dashboard', label: 'Orders', Icon: IconOrders },
    { path: '/dashboard/products', label: 'Shop', Icon: IconProducts },
  ]
  const right = [
    { path: '/dashboard/calculator', label: 'Calc', Icon: IconCalc },
    { path: '/', label: 'Form', Icon: IconForm },
  ]

  const isActive = (path) => path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname === path
  const tab = ({ path, label, Icon }) => {
    const active = isActive(path)
    const color = active ? 'var(--primary)' : '#A8999F'
    return (
      <button key={path} style={s.tab} onClick={() => navigate(path)}>
        <Icon color={color} />
        <span style={{ ...s.tabLabel, color }}>{label}</span>
        {active && <div style={s.activeDot} />}
      </button>
    )
  }

  return (
    <nav style={s.bottomNav} className="no-print">
      {left.map(tab)}
      <button style={s.fab} onClick={() => navigate('/dashboard/calculator')} aria-label="New quote or invoice">
        <span style={s.fabPlus}>+</span>
      </button>
      {right.map(tab)}
    </nav>
  )
}

const s = {
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
  fab: {
    flexShrink: 0, width: 54, height: 54, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), var(--primary))',
    border: '3px solid var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 18px rgba(201,110,136,0.45)', alignSelf: 'center', marginTop: -22, marginBottom: 10,
  },
  fabPlus: { fontSize: 28, color: '#fff', fontWeight: 300, lineHeight: 1, marginTop: -2 },
}
