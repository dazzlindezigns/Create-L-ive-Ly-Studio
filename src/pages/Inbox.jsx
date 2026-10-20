import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BRAND } from '../brand'
import Nav from '../components/Nav'
import { ui, Loading } from '../components/ui'

// Customer email replies (email_log rows with direction 'in'), newest first.
// Tapping one opens its order, where the full thread and Reply live.
export default function Inbox() {
  const navigate = useNavigate()
  const [inbox, setInbox] = useState(null)
  const [problems, setProblems] = useState([])
  const [orders, setOrders] = useState({})
  const [open, setOpen] = useState(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('email_log')
        .select('id, created_at, order_id, from_email, subject, body_text, attachment_urls, read_at')
        .eq('direction', 'in').order('created_at', { ascending: false }).limit(100)
      setInbox(data || [])
      // Emails that didn't reach the customer and haven't been looked at yet.
      const { data: bad } = await supabase.from('email_log')
        .select('id, created_at, order_id, to_email, subject, status, error')
        .eq('direction', 'out').in('status', ['bounced', 'complained', 'failed']).is('read_at', null)
        .order('created_at', { ascending: false }).limit(50)
      setProblems(bad || [])
      const ids = [...new Set([...(data || []), ...(bad || [])].map(m => m.order_id).filter(Boolean))]
      if (ids.length) {
        const { data: os } = await supabase.from('orders').select('id, customer_name, product_type').in('id', ids)
        setOrders(Object.fromEntries((os || []).map(o => [o.id, o])))
      }
    }
    load()
    const ch = supabase.channel('inbox-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_log' }, load).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const dismiss = async (id) => {
    await supabase.from('email_log').update({ read_at: new Date().toISOString() }).eq('id', id)
    setProblems(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div style={ui.page} className="admin-page">
      <div style={{ ...ui.wrap, maxWidth: 900 }}>
        <header style={{ marginBottom: 16 }}>
          <div style={ui.eyebrow}>{BRAND.name}</div>
          <h1 style={ui.h1}>Inbox</h1>
          <p style={{ ...ui.muted, marginTop: 4 }}>Customer replies (they also land in your regular inbox), plus any email that didn’t reach a customer.</p>
        </header>
        {problems.length > 0 && (
          <section style={{ marginBottom: 18 }}>
            <h2 style={{ ...ui.h2, color: 'var(--danger)' }}>⚠ Didn’t arrive ({problems.length})</h2>
            <p style={{ ...ui.muted, margin: '-4px 0 10px' }}>These emails bounced or were marked as spam. Check the address on the order and send again — opening the order clears it from here.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {problems.map(p => {
                const order = orders[p.order_id]
                return (
                  <button key={p.id} onClick={() => p.order_id ? navigate(`/dashboard/order/${p.order_id}`) : dismiss(p.id)}
                    style={{ ...ui.card, ...styles.row, borderColor: 'var(--danger)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ ...styles.name, fontWeight: 700 }}>{order?.customer_name || p.to_email}</div>
                        <div style={styles.subject}>{p.subject}</div>
                      </div>
                      <span style={{ ...styles.pill, color: 'var(--danger)', background: 'rgba(200,65,75,0.1)', flexShrink: 0, alignSelf: 'flex-start' }}>
                        {{ bounced: 'Bounced', complained: 'Spam', failed: 'Failed' }[p.status]}
                      </span>
                    </div>
                    <div style={styles.preview}>{p.to_email}{p.error ? ` — ${p.error}` : ''}</div>
                    {!p.order_id && <div style={{ ...ui.hint, marginTop: 6 }}>Tap to dismiss</div>}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {inbox === null ? <Loading /> : inbox.length === 0 ? (
          <div style={{ ...ui.card, textAlign: 'center', color: 'var(--muted)', padding: 36 }}>
            No customer replies yet. When customers reply to your emails, they’ll show up here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {inbox.map(m => {
              const order = orders[m.order_id]
              const unread = !m.read_at
              return (
                <button key={m.id} onClick={() => m.order_id ? navigate(`/dashboard/order/${m.order_id}`) : setOpen(open === m.id ? null : m.id)}
                  style={{ ...ui.card, ...styles.row, ...(unread ? { borderColor: 'var(--primary)' } : {}) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ ...styles.name, fontWeight: unread ? 800 : 600 }}>
                        {unread && <span style={styles.dot} />}{order?.customer_name || m.from_email}
                      </div>
                      <div style={styles.subject}>{m.subject}</div>
                    </div>
                    <span style={{ ...ui.muted, flexShrink: 0 }}>{new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: BRAND.timezone })}</span>
                  </div>
                  <div style={styles.preview}>{(m.body_text || '').slice(0, 160) || '(attachments only)'}</div>
                  <div style={styles.meta}>
                    {m.attachment_urls?.length > 0 && <span style={styles.pill}>📎 {m.attachment_urls.length}</span>}
                    <span style={styles.pill}>{order ? order.product_type : 'No matching order'}</span>
                  </div>
                  {!m.order_id && open === m.id && <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, marginTop: 10 }}>{m.body_text}</p>}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <Nav />
    </div>
  )
}

const styles = {
  row: { width: '100%', textAlign: 'left', cursor: 'pointer', padding: 16, font: 'inherit', color: 'inherit' },
  name: { fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  subject: { fontSize: 13, color: 'var(--mid)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  preview: { fontSize: 13, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' },
  meta: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, fontSize: 12 },
  pill: { background: 'var(--card2)', borderRadius: 6, padding: '2px 7px', fontWeight: 600, color: 'var(--mid)' },
  dot: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', marginRight: 6, verticalAlign: 'middle' },
}
