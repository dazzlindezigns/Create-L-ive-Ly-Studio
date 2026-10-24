import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { APP_URL } from '../lib/api'
import { fmt, round2 } from '../lib/money'
import { commissionFor, partnerTotals, cleanCode, REF_DAYS } from '../lib/affiliates'
import { BRAND } from '../brand'
import Nav from '../components/Nav'
import { ui, Button, Field, Input, Loading, useFlash, Modal } from '../components/ui'

const STATE_LABEL = { pending: 'Not complete yet', ready: 'Ready to pay', paid: 'Paid' }
const BLANK = { name: '', email: '', code: '', rate: 25, payout_note: '', active: true }

// Partners share links with ?ref=CODE and earn a share of what their visitors buy.
// She pays them outside the app and taps "Mark paid".
export default function Partners() {
  const navigate = useNavigate()
  const [partners, setPartners] = useState(null)
  const [orders, setOrders] = useState([])
  const [missing, setMissing] = useState(false)
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(null)
  const [toast, flash] = useFlash()

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('affiliates').select('*').order('created_at', { ascending: true })
    if (error) { setMissing(true); setPartners([]); return }
    setPartners(data || [])
    const { data: os } = await supabase.from('orders')
      .select('id, created_at, customer_name, product_type, status, price, amount_paid, refunded_amount, balance_paid, commission, commission_payout_id, affiliate_id')
      .not('affiliate_id', 'is', null).order('created_at', { ascending: false }).limit(1000)
    setOrders(os || [])
  }, [])
  useEffect(() => { load() }, [load])

  const copy = (text, msg) => navigator.clipboard.writeText(text).then(() => flash(msg), () => flash('Copy failed', 'error'))

  const markPaid = async (p, ready) => {
    const amount = round2(ready.reduce((s, o) => s + commissionFor(o).amount, 0))
    if (!confirm(`Mark ${fmt(amount)} as paid to ${p.name}?${p.payout_note ? `\n\nYou pay them: ${p.payout_note}` : ''}`)) return
    const { data: payout, error } = await supabase.from('affiliate_payouts').insert({ affiliate_id: p.id, amount }).select().single()
    if (error) return flash(error.message, 'error')
    const { error: e2 } = await supabase.from('orders').update({ commission_payout_id: payout.id }).in('id', ready.map(o => o.id))
    if (e2) return flash(e2.message, 'error')
    flash(`Marked ${fmt(amount)} paid to ${p.name} 💸`); load()
  }

  if (!partners) return <div style={ui.page} className="admin-page"><Loading /><Nav /></div>

  return (
    <div style={ui.page} className="admin-page">
      <div style={{ ...ui.wrap, maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={ui.eyebrow}>Shop</div>
            <h1 style={ui.h1}>Partners</h1>
          </div>
          {!missing && <Button small onClick={() => setEditing(BLANK)}>+ Add partner</Button>}
        </header>

        {missing ? (
          <div style={{ ...ui.card, ...ui.error }}>Partners need a quick database update — run <strong>20261026000000_affiliates_and_reviews.sql</strong> in the Supabase SQL Editor, then reload.</div>
        ) : (
          <div style={{ ...ui.card, padding: 14, fontSize: 13, color: 'var(--mid)', lineHeight: 1.6 }}>
            Each partner gets a link with their code — it never expires. Anyone who taps it is credited to that partner for {REF_DAYS} days, so a purchase in that time earns the partner their share of the items (after discounts, not shipping).
            It’s <strong>ready to pay</strong> once the order is complete. Refunds lower it automatically. Partners don’t earn on their own orders.
            Send each partner their stats page — it has their links and earnings.
          </div>
        )}

        {partners.length === 0 && !missing && (
          <div style={{ ...ui.card, textAlign: 'center', color: 'var(--muted)', padding: 30 }}>No partners yet. Tap “+ Add partner” to set up the first one.</div>
        )}

        {partners.map(p => {
          const mine = orders.filter(o => o.affiliate_id === p.id)
          const t = partnerTotals(mine)
          const ready = mine.filter(o => commissionFor(o).state === 'ready')
          const link = `${APP_URL}/?ref=${p.code}`
          return (
            <section key={p.id} style={{ ...ui.card, opacity: p.active ? 1 : 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ ...ui.h2, marginBottom: 2 }}>{p.name}</h2>
                  <div style={ui.muted}>
                    <span style={styles.code}>{p.code}</span> · {Number(p.rate)}%{!p.active && ' · Paused'}
                    {p.payout_note && <> · Pay: {p.payout_note}</>}
                  </div>
                </div>
                <button onClick={() => setEditing({ ...p })} style={styles.link}>Edit</button>
              </div>

              <div style={styles.stats}>
                <Stat n={p.clicks || 0} label="Clicks" />
                <Stat n={t.count} label="Sales" />
                <Stat n={fmt(t.pending)} label="Not complete" />
                <Stat n={fmt(t.ready)} label="Ready to pay" strong={t.ready > 0} />
                <Stat n={fmt(t.paid)} label="Paid" />
              </div>

              <div style={{ ...ui.row, gap: 8 }}>
                {ready.length > 0 && <Button small onClick={() => markPaid(p, ready)}>Mark {fmt(t.ready)} paid</Button>}
                <Button small variant="ghost" onClick={() => copy(link, 'Partner link copied')}>Copy their link</Button>
                <Button small variant="ghost" onClick={() => copy(`${APP_URL}/partner/${p.token}`, 'Stats page link copied — send it to them')}>Copy their stats page</Button>
                {mine.length > 0 && <Button small variant="ghost" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? 'Hide orders' : 'Orders'}</Button>}
              </div>

              {open === p.id && (
                <div style={{ marginTop: 12 }}>
                  {mine.map(o => {
                    const c = commissionFor(o)
                    return (
                      <button key={o.id} onClick={() => navigate(`/dashboard/order/${o.id}`)} style={styles.orderRow}>
                        <span style={{ minWidth: 0, textAlign: 'left' }}>
                          <strong>{o.customer_name}</strong> · {new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: BRAND.timezone })}
                          <div style={ui.muted}>{o.product_type}</div>
                        </span>
                        <span style={{ textAlign: 'right', flexShrink: 0 }}>
                          <strong>{c.state === 'void' ? '—' : fmt(c.amount)}</strong>
                          <div style={ui.muted}>{c.state === 'void' ? (o.status === 'refunded' ? 'Refunded' : 'Not paid') : STATE_LABEL[c.state]}</div>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {editing && <PartnerModal partner={editing} onClose={() => setEditing(null)} flash={flash}
        onSaved={(msg) => { setEditing(null); flash(msg); load() }} />}
      {toast}
      <Nav />
    </div>
  )
}

function PartnerModal({ partner, onClose, onSaved, flash }) {
  const [f, setF] = useState({ ...BLANK, ...partner })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const autoCode = !partner.id && !f.codeTouched

  const save = async () => {
    const code = cleanCode(f.code || f.name.split(' ')[0])
    const rate = Number(f.rate)
    if (!f.name.trim() || !code) return flash('Name and code are required', 'error')
    if (!(rate > 0 && rate <= 90)) return flash('Commission should be between 1% and 90%', 'error')
    setBusy(true)
    const row = { name: f.name.trim(), email: f.email.trim().toLowerCase() || null, code, rate, payout_note: f.payout_note.trim() || null, active: f.active }
    const { error } = partner.id
      ? await supabase.from('affiliates').update(row).eq('id', partner.id)
      : await supabase.from('affiliates').insert(row)
    setBusy(false)
    if (error) return flash(/duplicate|unique/i.test(error.message) ? `The code ${code} is taken — try another` : error.message, 'error')
    onSaved(partner.id ? 'Partner updated' : `${row.name} added — copy their stats page to send it`)
  }

  return (
    <Modal title={partner.id ? `Edit ${partner.name}` : 'Add a partner'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Name"><Input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value, ...(autoCode ? { code: cleanCode(e.target.value.split(' ')[0]) } : {}) }))} autoFocus /></Field>
        <Field label="Email (optional)" hint="Used to make sure they don’t earn on their own orders."><Input type="email" value={f.email || ''} onChange={set('email')} /></Field>
        <div style={ui.row}>
          <Field label="Code" hint={`Their link: …/?ref=${cleanCode(f.code) || 'CODE'}`}>
            <Input value={f.code} onChange={e => setF(p => ({ ...p, code: cleanCode(e.target.value), codeTouched: true }))} />
          </Field>
          <Field label="Commission %" style={{ maxWidth: 140 }}><Input type="number" min="1" max="90" value={f.rate} onChange={set('rate')} /></Field>
        </div>
        <Field label="How you pay them (optional)"><Input value={f.payout_note || ''} onChange={set('payout_note')} placeholder="e.g. Cash App $tasha" /></Field>
        {partner.id && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={f.active} onChange={set('active')} /> Active (untick to pause their link)
          </label>
        )}
        <Button block loading={busy} onClick={save}>{partner.id ? 'Save changes' : 'Add partner'}</Button>
      </div>
    </Modal>
  )
}

const Stat = ({ n, label, strong }) => (
  <div style={{ ...styles.stat, ...(strong ? { borderColor: 'var(--success)' } : {}) }}>
    <div style={{ fontWeight: 800, fontSize: 16, color: strong ? 'var(--success)' : 'var(--dark)' }}>{n}</div>
    <div style={styles.statLabel}>{label}</div>
  </div>
)

const styles = {
  code: { fontFamily: 'monospace', fontWeight: 700, color: 'var(--dark)' },
  link: { background: 'none', border: 'none', color: 'var(--secondary)', fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 4 },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 8, margin: '14px 0' },
  stat: { background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 10px' },
  statLabel: { fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 },
  orderRow: { display: 'flex', justifyContent: 'space-between', gap: 10, width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid var(--border)', background: 'none', font: 'inherit', color: 'inherit', fontSize: 14, cursor: 'pointer' },
}
