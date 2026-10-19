import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { BRAND, EMAIL_TEMPLATES } from '../brand'
import { ui, Button, Field, Input, TextArea, Select, Badge } from './ui'

const KIND_LABELS = {
  reply: 'Customer reply', manual: 'Written by you', request_received: 'Request received', quote: 'Quote', invoice: 'Invoice',
  proof: 'Proof', shipped: 'Shipped', receipt: 'Payment receipt', downloads: 'Downloads',
  in_production: 'In production', ready_for_pickup: 'Ready for pickup', completed: 'Thank you', declined: 'Declined', payment_reminder: 'Payment reminder',
}

const fillTemplate = (text, order) => text
  .replaceAll('{firstName}', (order.customer_name || '').split(' ')[0] || 'there')
  .replaceAll('{product}', order.product_type || 'custom')
  .replaceAll('{orderNumber}', `#${order.id.slice(0, 8)}`)
  .replaceAll('{owner}', BRAND.ownerFirstName)
  .replaceAll('{business}', BRAND.name)
  .replaceAll('{location}', BRAND.location)

// Order page: full email history for this order + compose/send in the studio's branded layout.
export default function EmailPanel({ order, flash }) {
  const [log, setLog] = useState(null)
  const [open, setOpen] = useState(null)
  const [composing, setComposing] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [link, setLink] = useState('order')
  const [sending, setSending] = useState(false)
  const [polishing, setPolishing] = useState(false)

  const hasDownloads = (order.shop_cart || []).some(l => l.kind === 'digital')
  const linkOptions = [
    { value: 'order', label: 'Button: View your order' },
    ...(order.proof_status === 'sent' ? [{ value: 'proof', label: 'Button: Review your proof' }] : []),
    ...(hasDownloads ? [{ value: 'downloads', label: 'Button: Get your downloads' }] : []),
    { value: 'none', label: 'No button' },
  ]

  const load = useCallback(async () => {
    const { data } = await supabase.from('email_log').select('*').eq('order_id', order.id).order('created_at', { ascending: false })
    setLog(data || [])
    // Opening the order counts as reading its customer replies (clears the dashboard Inbox badge).
    if ((data || []).some(e => e.direction === 'in' && !e.read_at)) {
      await supabase.from('email_log').update({ read_at: new Date().toISOString() })
        .eq('order_id', order.id).eq('direction', 'in').is('read_at', null)
    }
  }, [order.id])
  // Re-fetch when the order changes (e.g. a quote or proof email was just sent) without losing a draft.
  useEffect(() => { load() }, [load, order.updated_at])

  const applyTemplate = (key) => {
    const t = EMAIL_TEMPLATES.find(x => x.key === key)
    if (!t) return
    if (message.trim() && !confirm('Replace what you’ve written with this template?')) return
    setSubject(fillTemplate(t.subject, order))
    setMessage(fillTemplate(t.body, order))
  }

  const polish = async () => {
    setPolishing(true)
    try {
      const r = await api('draft-email', { auth: true, body: { orderId: order.id, draft: message, subject } })
      setSubject(r.subject)
      setMessage(r.body)
      flash('Polished ✨ — read it over before sending')
    } catch (e) { flash(e.message, 'error') } finally { setPolishing(false) }
  }

  const replyTo = (e) => {
    setSubject(/^re:/i.test(e.subject) ? e.subject : `Re: ${e.subject}`)
    setMessage(`Hi ${(order.customer_name || '').split(' ')[0]}!\n\n\n\n${BRAND.ownerFirstName}`)
    setComposing(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const send = async () => {
    if (/\[[^\]]+\]/.test(message) && !confirm('There’s still a [bracketed] blank in your message. Send anyway?')) return
    setSending(true)
    try {
      await api('send-customer-email', { auth: true, body: { orderId: order.id, subject, message, link } })
      flash(`Email sent to ${order.customer_email} ✉️`)
      setSubject(''); setMessage(''); setComposing(false)
      load()
    } catch (e) { flash(e.message, 'error') } finally { setSending(false) }
  }

  return (
    <section style={ui.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <h2 style={ui.h2}>Emails</h2>
        {!composing && <Button small onClick={() => setComposing(true)}>✉️ Write email</Button>}
      </div>

      {composing && (
        <div style={styles.compose}>
          <div style={{ ...ui.muted, marginBottom: 10 }}>To <strong>{order.customer_name}</strong> &lt;{order.customer_email}&gt; · replies go to your inbox</div>
          <Field label="Start from a template (optional)">
            <Select value="" onChange={e => applyTemplate(e.target.value)}
              options={[{ value: '', label: 'Choose a template…' }, ...EMAIL_TEMPLATES.map(t => ({ value: t.key, label: t.label }))]} />
          </Field>
          <Field label="Subject" style={{ marginTop: 10 }}><Input value={subject} onChange={e => setSubject(e.target.value)} /></Field>
          <Field label="Message" style={{ marginTop: 10 }} hint="Write it however it comes out — “Polish with Claude” will tidy it up in your voice.">
            <TextArea rows={8} value={message} onChange={e => setMessage(e.target.value)} />
          </Field>
          <Field label="Link button" style={{ marginTop: 10 }}>
            <Select value={link} onChange={e => setLink(e.target.value)} options={linkOptions} />
          </Field>
          <div style={{ ...ui.row, marginTop: 12 }}>
            <Button small loading={sending} disabled={!subject.trim() || !message.trim()} onClick={send}>Send email</Button>
            <Button small variant="ghost" loading={polishing} disabled={!message.trim()} onClick={polish}>✨ Polish with Claude</Button>
            <Button small variant="ghost" onClick={() => setComposing(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {log === null ? <div style={ui.muted}>Loading…</div> : log.length === 0 ? (
        <div style={ui.muted}>No emails yet for this order.</div>
      ) : (
        <div style={{ marginTop: composing ? 14 : 0 }}>
          {log.map(e => (
            <div key={e.id} style={{ ...styles.row, ...(e.direction === 'in' ? styles.inRow : {}) }}>
              <button onClick={() => setOpen(open === e.id ? null : e.id)} style={styles.rowBtn} disabled={!e.body_text && !e.attachment_urls && e.status === 'sent'}>
                <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subject}</div>
                  <div style={ui.muted}>
                    {e.direction === 'in' && <>{e.from_email} · </>}
                    {e.attachment_urls?.length > 0 && <>📎 {e.attachment_urls.length} · </>}
                    {new Date(e.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: BRAND.timezone })}
                  </div>
                </div>
                {e.status === 'failed'
                  ? <Badge color="var(--danger)" bg="rgba(200,65,75,0.1)">Failed</Badge>
                  : e.direction === 'in'
                  ? <Badge color="#fff" bg="var(--primary)">{KIND_LABELS.reply}</Badge>
                  : <Badge color={e.kind === 'manual' ? 'var(--primary)' : 'var(--muted)'} bg="var(--card2)">{KIND_LABELS[e.kind] || e.kind}</Badge>}
              </button>
              {open === e.id && (
                <div style={styles.body}>
                  {e.status === 'failed' ? `Error: ${e.error}` : e.body_text || (e.direction === 'in' ? '(no text — see attachments)' : '')}
                  {e.attachment_urls?.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      {e.attachment_urls.map(u => (
                        <a key={u} href={u} target="_blank" rel="noreferrer" style={styles.attach}>
                          {/\.(png|jpe?g|gif|webp|heic)$/i.test(u)
                            ? <img src={u} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                            : `📎 ${decodeURIComponent(u.split('/').pop()).replace(/^\d+-[0-9a-f-]{36}-/, '')}`}
                        </a>
                      ))}
                    </div>
                  )}
                  {e.direction === 'in' && (
                    <div style={{ marginTop: 10 }}><Button small onClick={() => replyTo(e)}>↩ Reply</Button></div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const styles = {
  compose: { background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 4 },
  row: { borderBottom: '1px solid var(--border)' },
  rowBtn: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit' },
  inRow: { background: 'linear-gradient(90deg, var(--card2), transparent)', borderRadius: 10, paddingLeft: 8, marginLeft: -8 },
  attach: { fontSize: 13, color: 'var(--secondary)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'normal' },
  body: { whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, color: 'var(--mid)', background: 'var(--card2)', borderRadius: 10, padding: 12, marginBottom: 10 },
}
