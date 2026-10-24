import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/money'
import { TODO_PRIORITY, FILTER_TABS, PIPELINE, nextStep, isAbandoned } from '../lib/status'
import { BRAND } from '../brand'
import Nav, { AppLinks, IconExternal } from '../components/Nav'
import { ui, Badge, Loading, useFlash } from '../components/ui'

export default function Dashboard() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState(null)
  const [filter, setFilter] = useState(() => {
    const saved = sessionStorage.getItem('dash-filter')
    return FILTER_TABS.some(t => t.key === saved) ? saved : 'todo'
  })
  const [search, setSearch] = useState('')
  const [shopOpen, setShopOpen] = useState(null)
  const [toast, flash] = useFlash()

  const loadOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('id, created_at, customer_name, customer_email, product_type, quantity, status, price, amount_paid, need_by, source, fulfillment')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) flash(error.message, 'error')
    setOrders(data || [])
  }

  useEffect(() => {
    loadOrders()
    // Read straight from Supabase as the signed-in admin (RLS allows it).
    supabase.from('settings').select('value').eq('key', 'shop_open').maybeSingle()
      .then(({ data }) => setShopOpen(data ? data.value !== false && data.value !== 'false' : true))
    const channel = supabase.channel('orders-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { sessionStorage.setItem('dash-filter', filter) }, [filter])

  const toggleShop = async () => {
    const next = !shopOpen
    setShopOpen(next)
    const { error } = await supabase.from('settings').upsert({ key: 'shop_open', value: next })
    if (error) { setShopOpen(!next); return flash(error.message, 'error') }
    flash(next ? 'Shop is open 🛍' : 'Shop is closed — customers see your closed message')
  }

  const counts = useMemo(() => {
    const c = {}
    for (const o of orders || []) c[o.status] = (c[o.status] || 0) + 1
    return c
  }, [orders])

  const visible = useMemo(() => {
    if (!orders) return []
    const tab = FILTER_TABS.find(t => t.key === filter) || FILTER_TABS[0]
    let list = orders.filter(tab.match)
    // To do: most urgent first, then by due date.
    if (filter === 'todo') list.sort((a, b) => (TODO_PRIORITY[a.status] - TODO_PRIORITY[b.status])
      || new Date(a.need_by || a.created_at) - new Date(b.need_by || b.created_at))
    const q = search.trim().toLowerCase()
    // Search looks through every order, whatever tab is open.
    if (q) list = orders.filter(o => [o.customer_name, o.customer_email, o.product_type, o.id].some(v => String(v || '').toLowerCase().includes(q)))
    return list
  }, [orders, filter, search])

  const revenue = (orders || []).reduce((s, o) => s + (Number(o.amount_paid) || 0), 0)
  const todoCount = (orders || []).filter(FILTER_TABS[0].match).length

  return (
    <div style={ui.page} className="admin-page">
      <div style={{ ...ui.wrap, maxWidth: 1180 }}>
        <header style={styles.header}>
          <div>
            <div style={ui.eyebrow}>{BRAND.name}</div>
            <h1 style={ui.h1}>Orders</h1>
          </div>
          <div className="hide-desktop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <a href="/" target="_blank" rel="noreferrer" aria-label="View website" style={styles.iconBtn}><IconExternal size={17} color="var(--mid)" /></a>
              <button onClick={() => supabase.auth.signOut()} style={styles.signOut}>Sign out</button>
            </div>
            <AppLinks align="right" />
          </div>
        </header>

        {/* Pipeline — fits on a phone without scrolling */}
        <div className="dash-pipeline" style={styles.pipeline}>
          {PIPELINE.map(p => {
            const n = p.statuses.reduce((s, st) => s + (counts[st] || 0), 0)
            return (
              <div key={p.label} style={{ ...styles.stat, borderTop: `3px solid ${p.color}` }}>
                <div style={styles.statNum}>{n}</div>
                <div style={styles.statLabel}>{p.label}</div>
              </div>
            )
          })}
          <div style={{ ...styles.stat, borderTop: '3px solid var(--success)' }}>
            <div style={styles.statNum}>{fmt(revenue).replace('.00', '')}</div>
            <div style={styles.statLabel}>Collected</div>
          </div>
        </div>

        {/* Shop open/closed */}
        <div style={styles.shopRow}>
          <span><strong>Shop</strong> <span style={ui.muted}>· {shopOpen == null ? '…' : shopOpen ? 'Open — taking orders' : 'Closed'}</span></span>
          <button onClick={toggleShop} disabled={shopOpen == null} role="switch" aria-checked={!!shopOpen} aria-label="Shop open"
            style={{ ...styles.switch, background: shopOpen ? 'var(--success)' : '#ccc' }}>
            <span style={{ ...styles.knob, transform: shopOpen ? 'translateX(20px)' : 'none' }} />
          </button>
        </div>

        {/* Status filters — a grid, so every status is visible without scrolling */}
        <div className="dash-tabs" style={styles.tabs}>
          {FILTER_TABS.map(t => {
            const n = t.badge ? todoCount : 0
            const on = filter === t.key
            return (
              <button key={t.key} onClick={() => setFilter(t.key)} style={{ ...styles.tab, ...(on ? styles.tabOn : {}) }}>
                {t.label}{n > 0 && <span style={{ ...styles.tabBadge, ...(on ? { background: '#fff', color: 'var(--primary)' } : {}) }}>{n}</span>}
              </button>
            )
          })}
        </div>

        <input placeholder="Search name, email or product…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...ui.input, marginBottom: 12 }} />

        {orders === null ? <Loading /> : visible.length === 0 ? (
          <Empty text={filter === 'todo' ? 'All caught up — nothing needs you right now. ✨' : 'No orders here.'} />
        ) : (
          <div className="order-grid">
            {visible.map(o => (
              <button key={o.id} onClick={() => navigate(`/dashboard/order/${o.id}`)} style={{ ...ui.card, ...styles.orderCard }}>
                <div style={styles.cardTop}>
                  <div style={{ minWidth: 0, textAlign: 'left' }}>
                    <div style={styles.name}>{o.customer_name}</div>
                    <div style={styles.product}>{o.product_type} · {o.quantity}</div>
                  </div>
                  {isAbandoned(o) ? <Badge color="var(--muted)" bg="var(--card2)">Didn’t pay</Badge> : <Badge status={o.status} />}
                </div>
                <NextHint order={o} />
                <div style={styles.meta}>
                  <span>{new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  {o.source === 'shop' && <span style={styles.pill}>Shop</span>}
                  {o.source === 'invoice' && <span style={styles.pill}>Invoice</span>}
                  {o.fulfillment === 'shipping' && <span style={styles.pill}>Ships</span>}
                  {o.fulfillment === 'digital' && <span style={styles.pill}>Digital</span>}
                  {o.need_by && <span style={{ color: dueColor(o.need_by), fontWeight: 600 }}>Due {new Date(o.need_by + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                  <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--dark)' }}>{o.price != null ? fmt(o.price) : 'Needs quote'}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {toast}
      <Nav />
    </div>
  )
}

function dueColor(d) {
  const days = (new Date(d + 'T00:00:00') - new Date()) / 86400000
  return days < 2 ? 'var(--danger)' : days < 5 ? 'var(--warning)' : 'var(--muted)'
}

// One line on each card saying what happens next, so she doesn't have to open the order to know.
function NextHint({ order }) {
  if (isAbandoned(order)) return null
  const step = nextStep(order)
  if (step.done) return null
  const todo = order.status in TODO_PRIORITY
  return <div style={{ ...styles.next, color: todo ? 'var(--primary)' : 'var(--muted)' }}>{todo ? '→ ' : '⏳ '}{step.short}</div>
}

const Empty = ({ text }) => <div style={{ ...ui.card, textAlign: 'center', color: 'var(--muted)', padding: 36 }}>{text}</div>

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 },
  signOut: { fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 12px', cursor: 'pointer' },
  pipeline: { marginBottom: 12 },
  stat: { background: 'var(--card)', borderRadius: 14, padding: '10px 12px', border: '1px solid var(--border)', minWidth: 0 },
  statNum: { fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' },
  statLabel: { fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 },
  shopRow: { ...ui.card, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 14 },
  iconBtn: { width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card)' },
  switch: { width: 46, height: 26, borderRadius: 26, border: 'none', position: 'relative', cursor: 'pointer', padding: 3, flexShrink: 0, transition: 'background .2s' },
  knob: { display: 'block', width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'transform .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },
  tabs: { marginBottom: 12 },
  tab: { padding: '8px 6px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--card)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden' },
  tabOn: { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' },
  tabBadge: { background: 'var(--primary)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 800, padding: '1px 6px', flexShrink: 0 },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  orderCard: { width: '100%', cursor: 'pointer', padding: 16, textAlign: 'left', font: 'inherit', color: 'inherit' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, cursor: 'pointer' },
  name: { fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  product: { fontSize: 13, color: 'var(--mid)', marginTop: 2 },
  meta: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: 'var(--muted)' },
  dot: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', marginRight: 6, verticalAlign: 'middle' },
  next: { fontSize: 13, fontWeight: 700, marginTop: 8, textAlign: 'left' },
  pill: { background: 'var(--card2)', borderRadius: 6, padding: '2px 7px', fontWeight: 600, color: 'var(--mid)' },
}

