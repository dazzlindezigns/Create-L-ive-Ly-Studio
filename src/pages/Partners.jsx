import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api, APP_URL } from '../lib/api'
import { fmt, round2 } from '../lib/money'
import { commissionFor, partnerTotals, cleanCode, REF_DAYS } from '../lib/affiliates'
import { BRAND, PARTNER_PROGRAM, PAYOUT_METHODS } from '../brand'
import Nav from '../components/Nav'
import { ui, Button, Field, Input, Select, Loading, useFlash, Modal } from '../components/ui'

const STATE_LABEL = { pending: 'Not complete yet', ready: 'Ready to pay', paid: 'Paid' }
const BLANK = { name: '', email: '', code: '', rate: 25, own_discount: 25, payout_method: '', payout_handle: '', active: true }
// How she pays them, e.g. "Cash App $tasha" (older partners may only have the free-text note).
const payText = (p) => p.payout_method && p.payout_handle ? `${p.payout_method} ${p.payout_handle}` : p.payout_note || ''

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
    if (!confirm(`Mark ${fmt(amount)} as paid to ${p.name}?${payText(p) ? `\n\nPay them by: ${payText(p)}` : ''}`)) return
    const { data: payout, error } = await supabase.from('affiliate_payouts').insert({ affiliate_id: p.id, amount }).select().single()
    if (error) return flash(error.message, 'error')
    const { error: e2 } = await supabase.from('orders').update({ commission_payout_id: payout.id }).in('id', ready.map(o => o.id))
    if (e2) return flash(e2.message, 'error')
    flash(`Marked ${fmt(amount)} paid to ${p.name} 💸`); load()
  }

  const welcome = async (p) => {
    try { await api('resend-partner-welcome', { auth: true, body: { partnerId: p.id } }); flash(`Welcome email sent to ${p.name} 💕`); load() }
    catch (e) { flash(e.message, 'error') }
  }

  if (!partners) return <div style={ui.page} className="admin-page"><Loading /><Nav /></div>

  return (
    <div style={ui.page} className="admin-page">
      <div style={{ ...ui.wrap, maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={ui.eyebrow}>{PARTNER_PROGRAM.icon} Partners</div>
            <h1 style={ui.h1}>{PARTNER_PROGRAM.name}</h1>
          </div>
          {!missing && <Button small onClick={() => setEditing(BLANK)}>+ Add partner</Button>}
        </header>

        {missing ? (
          <div style={{ ...ui.card, ...ui.error }}>Partners need a quick database update — run <strong>20261026000000_affiliates_and_reviews.sql</strong> in the Supabase SQL Editor, then reload.</div>
        ) : (
          <details style={{ ...ui.card, padding: 14, fontSize: 13, color: 'var(--mid)', lineHeight: 1.6 }}>
            <summary style={{ fontWeight: 700, color: 'var(--dark)', cursor: 'pointer' }}>How it works</summary>
            <ul style={{ paddingLeft: 18, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>Add a partner and they get a welcome email with their private page (their links, earnings, and a “Shop for myself” button).</li>
              <li>Their links never expire. When someone taps one, that shopper counts as theirs for {REF_DAYS} days — buy today or come back next week, the partner still gets credit.</li>
              <li>They earn their % of the items (after discounts, not shipping). It’s <strong>ready to pay</strong> once the order is complete; refunds lower it automatically.</li>
              <li>Their own orders get their discount instead (no commission on those).</li>
              <li>Pay them by their Cash App / Zelle / PayPal / Venmo, then tap <strong>Mark paid</strong>.</li>
            </ul>
          </details>
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
                    <span style={styles.code}>{p.code}</span> · earns {Number(p.rate)}% · {Number(p.own_discount ?? 25)}% off their own orders{!p.active && ' · Paused'}
                  </div>
                  <div style={{ ...ui.muted, marginTop: 2 }}>
                    {payText(p)
                      ? <>💸 Pay by <strong style={{ color: 'var(--dark)' }}>{payText(p)}</strong>{p.payout_handle && <button onClick={() => copy(p.payout_handle, `${p.payout_handle} copied`)} style={styles.link}>Copy</button>}</>
                      : <span style={{ color: 'var(--warning)', fontWeight: 600 }}>No payment info yet — they can add it on their page</span>}
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
                <Button small variant="ghost" onClick={() => copy(`${APP_URL}/partner/${p.token}`, 'Their page link copied')}>Copy their page link</Button>
                <Button small variant="ghost" onClick={() => welcome(p)}>{p.welcomed_at ? 'Resend welcome email' : 'Send welcome email'}</Button>
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
    const own = Number(f.own_discount)
    const email = String(f.email || '').trim().toLowerCase()
    if (!f.name.trim() || !code) return flash('Name and code are required', 'error')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return flash('Add their email — their welcome email and page link go there', 'error')
    if (!(rate > 0 && rate <= 90)) return flash('Commission should be between 1% and 90%', 'error')
    if (!(own >= 0 && own <= 90)) return flash('Their discount should be between 0% and 90%', 'error')
    setBusy(true)
    const row = {
      name: f.name.trim(), email, code, rate, own_discount: own, active: f.active,
      payout_method: f.payout_method || null, payout_handle: String(f.payout_handle || '').trim() || null,
    }
    const { data: saved, error } = partner.id
      ? await supabase.from('affiliates').update(row).eq('id', partner.id).select().single()
      : await supabase.from('affiliates').insert(row).select().single()
    if (error) {
      setBusy(false)
      return flash(/duplicate|unique/i.test(error.message) ? `The code ${code} is taken — try another`
        : /own_discount|payout_method|payout_handle/.test(error.message) ? 'Run 20261028000000_partner_perks_and_review_reminders.sql in Supabase first'
        : error.message, 'error')
    }
    // New partners get their welcome email (with their page link) right away.
    let msg = partner.id ? 'Partner updated' : `${row.name} added`
    if (!partner.id) {
      try { await api('resend-partner-welcome', { auth: true, body: { partnerId: saved.id } }); msg += ` — welcome email sent to ${email} 💕` }
      catch (e) { msg += ` — but the welcome email didn’t send: ${e.message}` }
    }
    setBusy(false)
    onSaved(msg)
  }

  return (
    <Modal title={partner.id ? `Edit ${partner.name}` : 'Add a partner'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Name"><Input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value, ...(autoCode ? { code: cleanCode(e.target.value.split(' ')[0]) } : {}) }))} autoFocus /></Field>
        <Field label="Email" hint={partner.id ? null : 'Their welcome email and private page link go here.'}><Input type="email" value={f.email || ''} onChange={set('email')} required /></Field>
        <div style={ui.row}>
          <Field label="Code" hint={`Their link: …/?ref=${cleanCode(f.code) || 'CODE'}`}>
            <Input value={f.code} onChange={e => setF(p => ({ ...p, code: cleanCode(e.target.value), codeTouched: true }))} />
          </Field>
        </div>
        <div style={ui.row}>
          <Field label="They earn %" hint="On sales from their links"><Input type="number" min="1" max="90" value={f.rate} onChange={set('rate')} /></Field>
          <Field label="Their own discount %" hint="Off their own orders"><Input type="number" min="0" max="90" value={f.own_discount ?? 25} onChange={set('own_discount')} /></Field>
        </div>
        <div style={ui.row}>
          <Field label="Pay them by"><Select value={f.payout_method || ''} onChange={set('payout_method')} options={[{ value: '', label: 'Not set yet' }, ...PAYOUT_METHODS]} /></Field>
          <Field label={{ 'Cash App': 'Cash App name ($cashtag)', Zelle: 'Zelle phone or email', PayPal: 'PayPal email or @name', Venmo: 'Venmo @name' }[f.payout_method] || 'Name / handle'}>
            <Input value={f.payout_handle || ''} onChange={set('payout_handle')} placeholder={f.payout_method === 'Cash App' ? '$tasha' : ''} />
          </Field>
        </div>
        {!partner.id && <div style={ui.hint}>Don’t know their payment info? Leave it — they can add it on their own page.</div>}
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
