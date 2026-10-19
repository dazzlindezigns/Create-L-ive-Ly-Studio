import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { initPush, enablePush } from '../lib/push'
import { fmt } from '../lib/money'
import { QUEUE_PRIORITY, FILTER_TABS, PIPELINE } from '../lib/status'
import { BRAND } from '../brand'
import Nav from '../components/Nav'
import { ui, Badge, Button, Loading, useFlash, Select } from '../components/ui'

const TIER_COLORS = { Spark: 'var(--success)', Wire: 'var(--secondary)', Forge: 'var(--plum)' }
const APPQUE_STATUSES = ['new', 'quoted', 'deposit_paid', 'in_progress', 'completed', 'declined']

export default function Dashboard() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState(null)
  const [appque, setAppque] = useState(null)
  const [filter, setFilter] = useState(() => sessionStorage.getItem('dash-filter') || 'queue')
  const [search, setSearch] = useState('')
  const [pushState, setPushState] = useState('idle')
  const [shopOpen, setShopOpen] = useState(null)
  const [openAppque, setOpenAppque] = useState(null)
  const [toast, flash] = useFlash()

  useEffect(() => {
    loadOrders()
    initPush().then(setPushState).catch(() => setPushState('unsupported'))
    api('get-settings').then(s => setShopOpen(s.shop_open !== false && s.shop_open !== 'false')).catch(() => {})

    // Live updates when new orders arrive or customers respond.
    const channel = supabase.channel('orders-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    sessionStorage.setItem('dash-filter', filter)
    if (filter === 'appque' && appque === null) loadAppque()
  }, [filter])

  const loadOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('id, created_at, customer_name, customer_email, product_type, quantity, status, price, amount_paid, need_by, source, fulfillment, po_number')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) flash(error.message, 'error')
    setOrders(data || [])
  }

  const loadAppque = async () => {
    const { data } = await supabase.from('appque_submissions').select('*').order('created_at', { ascending: false })
    setAppque(data || [])
  }

  const setAppqueStatus = async (id, status) => {
    const { error } = await supabase.from('appque_submissions').update({ status }).eq('id', id)
    if (error) return flash(error.message, 'error')
    setAppque(prev => prev.map(a => a.id === id ? { ...a, status } : a))
  }

  const toggleShop = async () => {
    const next = !shopOpen
    setShopOpen(next)
    try {
      await api('save-settings', { body: { key: 'shop_open', value: next }, auth: true })
      flash(next ? 'Shop is open 🛍' : 'Shop is closed')
    } catch (e) {
      setShopOpen(!next)
      flash(e.message, 'error')
    }
  }

  const onEnablePush = async () => {
    try {
      const state = await enablePush()
      setPushState(state)
      if (state === 'granted') flash('Notifications on for this device')
    } catch (e) { flash(e.message, 'error') }
  }

  const testPush = async () => {
    try {
      const r = await api('test-push', { body: {}, auth: true })
      flash(r.configured ? `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}` : 'VAPID keys are not set on the server', r.configured ? 'ok' : 'error')
    } catch (e) { flash(e.message, 'error') }
  }

  const counts = useMemo(() => {
    const c = {}
    for (const o of orders || []) c[o.status] = (c[o.status] || 0) + 1
    return c
  }, [orders])

  const visible = useMemo(() => {
    if (!orders) return []
    let list = filter === 'queue'
      ? orders.filter(o => o.status in QUEUE_PRIORITY).sort((a, b) => {
          const p = QUEUE_PRIORITY[a.status] - QUEUE_PRIORITY[b.status]
          if (p) return p
          return new Date(a.need_by || a.created_at) - new Date(b.need_by || b.created_at)
        })
      : filter === 'all' ? orders : orders.filter(o => o.status === filter)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(o => [o.customer_name, o.customer_email, o.product_type, o.po_number, o.id].some(v => String(v || '').toLowerCase().includes(q)))
    return list
  }, [orders, filter, search])

  const revenue = (orders || []).reduce((s, o) => s + (Number(o.amount_paid) || 0), 0)

  return (
    <div style={ui.page}>
      <div style={ui.wrap}>
        <header style={styles.header}>
          <div>
            <div style={ui.eyebrow}>{BRAND.name}</div>
            <h1 style={ui.h1}>Orders</h1>
          </div>
          <button onClick={() => supabase.auth.signOut()} style={styles.signOut}>Sign out</button>
        </header>

        {/* Pipeline */}
        <div style={styles.pipeline} className="scroll-x">
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

        {/* Controls */}
        <div style={styles.controls}>
          <div style={styles.controlCard}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Shop</div>
              <div style={ui.muted}>{shopOpen == null ? '…' : shopOpen ? 'Open — taking orders' : 'Closed'}</div>
            </div>
            <button onClick={toggleShop} disabled={shopOpen == null} aria-label="Toggle shop"
              style={{ ...styles.switch, background: shopOpen ? 'var(--success)' : '#ccc' }}>
              <span style={{ ...styles.knob, transform: shopOpen ? 'translateX(20px)' : 'none' }} />
            </button>
          </div>
          <div style={styles.controlCard}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Notifications</div>
              <div style={ui.muted}>
                {{ granted: 'On for this device', denied: 'Blocked in browser settings', unsupported: 'Install the app to enable', prompt: 'Off', idle: '…' }[pushState]}
              </div>
            </div>
            {pushState === 'prompt' && <Button small onClick={onEnablePush}>Enable</Button>}
            {pushState === 'granted' && <Button small variant="ghost" onClick={testPush}>Test</Button>}
          </div>
        </div>

        {/* Filters */}
        <div style={styles.tabs} className="scroll-x">
          {FILTER_TABS.map(t => {
            const n = t.badge ? counts[t.key] || 0 : 0
            const on = filter === t.key
            return (
              <button key={t.key} onClick={() => setFilter(t.key)} style={{ ...styles.tab, ...(on ? styles.tabOn : {}) }}>
                {t.label}{n > 0 && <span style={{ ...styles.tabBadge, ...(on ? { background: '#fff', color: 'var(--primary)' } : {}) }}>{n}</span>}
              </button>
            )
          })}
        </div>

        {filter !== 'appque' && (
          <input placeholder="Search name, email, product, PO…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...ui.input, marginBottom: 12 }} />
        )}

        {filter === 'appque' ? (
          appque === null ? <Loading /> : appque.length === 0 ? <Empty text="No AppQue submissions yet." /> : (
            <div style={styles.list}>
              {appque.map(a => (
                <div key={a.id} style={ui.card}>
                  <div style={styles.cardTop} onClick={() => setOpenAppque(openAppque === a.id ? null : a.id)}>
                    <div style={{ minWidth: 0 }}>
                      <div style={styles.name}>{a.client_name}</div>
                      <div style={ui.muted}>{a.client_email} · {new Date(a.created_at).toLocaleDateString()}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {a.tier && <Badge color={TIER_COLORS[a.tier]} bg="var(--card2)">{a.tier}</Badge>}
                      {a.estimated_price != null && <strong style={{ fontSize: 14 }}>{fmt(a.estimated_price)}</strong>}
                    </div>
                  </div>
                  {openAppque === a.id && (
                    <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.6 }}>
                      <p style={{ whiteSpace: 'pre-wrap', marginBottom: 10 }}>{a.description}</p>
                      {(a.questions || []).map((q, i) => (
                        <div key={i} style={{ marginBottom: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{q}</div>
                          <div style={{ color: 'var(--mid)' }}>{a.answers?.[i] || '—'}</div>
                        </div>
                      ))}
                      <div style={{ ...ui.row, alignItems: 'center', marginTop: 10 }}>
                        <span style={ui.muted}>Status</span>
                        <Select value={a.status || 'new'} onChange={e => setAppqueStatus(a.id, e.target.value)} options={APPQUE_STATUSES} style={{ maxWidth: 200, padding: '8px 10px' }} />
                        {a.client_phone && <a href={`tel:${a.client_phone}`}>{a.client_phone}</a>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : orders === null ? <Loading /> : visible.length === 0 ? (
          <Empty text={filter === 'queue' ? 'Queue is clear — nothing needs your hands right now. ✨' : 'No orders here.'} />
        ) : (
          <div style={styles.list}>
            {visible.map(o => (
              <button key={o.id} onClick={() => navigate(`/dashboard/order/${o.id}`)} style={{ ...ui.card, ...styles.orderCard }}>
                <div style={styles.cardTop}>
                  <div style={{ minWidth: 0, textAlign: 'left' }}>
                    <div style={styles.name}>{o.customer_name}</div>
                    <div style={styles.product}>{o.product_type} · {o.quantity}</div>
                  </div>
                  <Badge status={o.status} />
                </div>
                <div style={styles.meta}>
                  <span>{new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  {o.source === 'shop' && <span style={styles.pill}>Shop</span>}
                  {o.source === 'invoice' && <span style={styles.pill}>Invoice</span>}
                  {o.fulfillment === 'shipping' && <span style={styles.pill}>Ships</span>}
                  {o.fulfillment === 'digital' && <span style={styles.pill}>Digital</span>}
                  {o.fulfillment === 'event' && <span style={{ ...styles.pill, background: 'var(--primary)', color: '#fff' }}>Sticker Bar</span>}
                  {o.po_number && <span style={styles.pill}>PO {o.po_number}</span>}
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

const Empty = ({ text }) => <div style={{ ...ui.card, textAlign: 'center', color: 'var(--muted)', padding: 36 }}>{text}</div>

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 },
  signOut: { fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 12px', cursor: 'pointer' },
  pipeline: { display: 'flex', gap: 10, marginBottom: 14, paddingBottom: 2 },
  stat: { flex: '1 0 92px', background: 'var(--card)', borderRadius: 14, padding: '12px 12px', border: '1px solid var(--border)' },
  statNum: { fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' },
  statLabel: { fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 },
  controls: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 16 },
  controlCard: { ...ui.card, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  switch: { width: 46, height: 26, borderRadius: 26, border: 'none', position: 'relative', cursor: 'pointer', padding: 3, flexShrink: 0, transition: 'background .2s' },
  knob: { display: 'block', width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'transform .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },
  tabs: { display: 'flex', gap: 8, marginBottom: 12, paddingBottom: 2 },
  tab: { flexShrink: 0, padding: '8px 14px', borderRadius: 50, border: '1.5px solid var(--border)', background: 'var(--card)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--mid)', display: 'flex', alignItems: 'center', gap: 6 },
  tabOn: { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' },
  tabBadge: { background: 'var(--primary)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 800, padding: '1px 6px' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  orderCard: { width: '100%', cursor: 'pointer', padding: 16, textAlign: 'left', font: 'inherit', color: 'inherit' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, cursor: 'pointer' },
  name: { fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  product: { fontSize: 13, color: 'var(--mid)', marginTop: 2 },
  meta: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: 'var(--muted)' },
  pill: { background: 'var(--card2)', borderRadius: 6, padding: '2px 7px', fontWeight: 600, color: 'var(--mid)' },
}

