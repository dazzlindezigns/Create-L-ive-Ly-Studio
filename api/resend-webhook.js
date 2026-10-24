// Resend webhook:
//  • email.received → customer replies land in the app AND in her inbox.
//  • email.bounced / email.complained / email.failed → the email is flagged on its order and in the
//    Inbox, and she gets a push + email alert, so she knows a customer didn't get it.
// In Resend: Webhooks → add https://<domain>/api/resend-webhook for those events,
// and put its signing secret in RESEND_WEBHOOK_SECRET.
import { Resend } from 'resend'
import { db, APP_URL, MAKER_EMAIL, firstName } from './_lib/core.js'
import { sendEmail, emailMaker, layout, rows, button, REPLY_DOMAIN, esc } from './_lib/email.js'
import { notifyAdmins } from './_lib/push.js'
import { readInbound, storeAttachments } from './_lib/inbound.js'
import { COLORS } from '../src/brand.js'

export const config = { api: { bodyParser: false } }

const ORDER_ADDRESS = /^order-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i

async function rawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks).toString('utf8')
}

// "Jamie Rivera <jamie@x.com>" → "jamie@x.com"
const addressOf = (s) => String(s || '').match(/<([^>]+)>/)?.[1]?.trim().toLowerCase() || String(s || '').trim().toLowerCase()
const domainOf = (addr) => addressOf(addr).split('@')[1] || ''

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const key = process.env.RESEND_API_KEY
  if (!secret || !key) return res.status(500).json({ error: 'RESEND_WEBHOOK_SECRET / RESEND_API_KEY not set' })

  const body = await rawBody(req)
  const resend = new Resend(key)
  let event
  try {
    event = resend.webhooks.verify({
      payload: body,
      headers: {
        id: req.headers['svix-id'] || req.headers['webhook-id'],
        timestamp: req.headers['svix-timestamp'] || req.headers['webhook-timestamp'],
        signature: req.headers['svix-signature'] || req.headers['webhook-signature'],
      },
      webhookSecret: secret,
    })
  } catch {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const problem = DELIVERY_PROBLEMS[event?.type]
  if (event?.type !== 'email.received' && !problem) return res.status(200).json({ ok: true, ignored: true })

  try {
    if (problem) await handleDeliveryProblem(problem, event.data)
    else await handleReceived(resend, event.data)
  } catch (e) {
    console.error('resend-webhook error:', e)
    return res.status(500).json({ error: 'Handler failed' }) // Resend retries; the resend_email_id dedupe makes that safe
  }
  return res.status(200).json({ ok: true })
}

const DELIVERY_PROBLEMS = { 'email.bounced': 'bounced', 'email.complained': 'complained', 'email.failed': 'failed' }
const PROBLEM_TEXT = { bounced: 'bounced', complained: 'was marked as spam', failed: 'failed to send' }

async function handleDeliveryProblem(status, data) {
  const supabase = db()
  const reason = String(data.bounce?.message || data.failed?.reason || data.reason
    || (status === 'complained' ? 'The recipient marked this email as spam.' : '')).slice(0, 500) || null
  // Flag the logged email (read_at = null puts it in the Inbox). The status filter makes retries a no-op.
  const { data: flagged } = await supabase.from('email_log')
    .update({ status, error: reason, read_at: null })
    .eq('resend_id', data.email_id).neq('status', status)
    .select('id, order_id, to_email, subject')
  const row = flagged?.[0]
  if (!row && flagged) {
    // Already flagged (retry), or an email the app didn't log (e.g. alerts to her own inbox).
    const { data: known } = await supabase.from('email_log').select('id').eq('resend_id', data.email_id).maybeSingle()
    if (known) return
  }

  const to = row?.to_email || [].concat(data.to || []).join(', ')
  const subject = row?.subject || data.subject || 'an email'
  if (MAKER_EMAIL && addressOf(to) === addressOf(MAKER_EMAIL)) return // her own alert bounced — nothing useful to send
  const { data: order } = row?.order_id
    ? await supabase.from('orders').select('id, customer_name, product_type').eq('id', row.order_id).maybeSingle()
    : { data: null }
  const link = order ? `/dashboard/order/${order.id}` : '/dashboard/inbox'

  await Promise.all([
    notifyAdmins({
      title: `⚠️ Email ${PROBLEM_TEXT[status]}`,
      body: `${order?.customer_name || to} didn't get “${subject}”. Check the address and resend.`,
      url: link,
    }),
    emailMaker(`⚠️ An email to ${to} ${PROBLEM_TEXT[status]}`, layout({
      heading: `Email ${PROBLEM_TEXT[status]}`,
      body: `<p style="margin:0 0 12px;">This email didn't reach your customer. Double-check their address (fix it with “Edit details” on the order) and send it again, or text them.</p>`
        + rows([['To', esc(to)], ['Subject', esc(subject)], ['Order', esc(order ? `${order.customer_name} — ${order.product_type}` : '—')], ['Reason', esc(reason || '—')]])
        + button('Open in the app →', `${APP_URL}${link}`),
    })),
  ])
}

async function handleReceived(resend, data) {
  const supabase = db()
  const emailId = data.email_id

  // Webhook retries: skip anything already stored.
  const { data: seen } = await supabase.from('email_log').select('id').eq('resend_email_id', emailId).maybeSingle()
  if (seen) return

  const fromAddr = addressOf(data.from)
  const ourFrom = addressOf(process.env.EMAIL_FROM || '')
  // Loop guard: never process mail this app sent (e.g. a forward bouncing back into the receiving domain).
  if (fromAddr && (fromAddr === ourFrom || (REPLY_DOMAIN && domainOf(fromAddr) === REPLY_DOMAIN))) return

  const { data: email, error } = await resend.emails.receiving.get(emailId)
  if (error || !email) throw new Error(`Could not fetch received email ${emailId}: ${error?.message}`)
  if (email.headers && Object.keys(email.headers).some(h => h.toLowerCase() === 'x-studio-forwarded')) return

  // Match to an order: per-order reply address first, then the sender's most recent order.
  const recipients = [...(email.received_for || data.received_for || []), ...(email.to || [])]
  let orderId = recipients.map(r => addressOf(r).match(ORDER_ADDRESS)?.[1]).find(Boolean) || null
  let order = null
  if (orderId) {
    ({ data: order } = await supabase.from('orders').select('id, customer_name, customer_email, product_type').eq('id', orderId).maybeSingle())
  }
  if (!order && fromAddr) {
    ({ data: order } = await supabase.from('orders').select('id, customer_name, customer_email, product_type')
      .eq('customer_email', fromAddr).order('created_at', { ascending: false }).limit(1).maybeSingle())
  }
  orderId = order?.id || null

  // Text (plain or HTML) and attachments, including photos pasted into the message.
  const { text, attachments } = await readInbound(email)
  const attachmentUrls = await storeAttachments(supabase, attachments)

  const subject = email.subject || data.subject || '(no subject)'
  await supabase.from('email_log').insert({
    direction: 'in',
    kind: 'reply',
    order_id: orderId,
    from_email: email.from || data.from,
    to_email: recipients[0] || '',
    subject,
    body_text: text || null,
    attachment_urls: attachmentUrls.length ? attachmentUrls : null,
    resend_email_id: emailId,
    status: 'received',
  })

  const who = order?.customer_name ? firstName(order.customer_name) : fromAddr
  await notifyAdmins({
    title: `💬 ${who} replied`,
    body: `${subject}${attachments.length ? ` · 📎 ${attachments.length}` : ''}`,
    url: orderId ? `/dashboard/order/${orderId}` : '/dashboard',
    tag: `reply-${emailId}`,
  })

  await forwardToInbox({ email, data, subject, order, attachments })
}

// "Both": a copy goes to her normal inbox. Reply-To is the customer, so hitting Reply there answers them directly.
async function forwardToInbox({ email, data, subject, order, attachments }) {
  const forwardTo = (process.env.REPLY_FORWARD_TO || MAKER_EMAIL || '').trim()
  if (!forwardTo) return
  if (REPLY_DOMAIN && domainOf(forwardTo) === REPLY_DOMAIN) {
    // Forwarding into the same domain Resend receives for would loop back into this webhook.
    console.error(`Not forwarding: ${forwardTo} is on the receiving domain ${REPLY_DOMAIN}. Set REPLY_FORWARD_TO to an inbox elsewhere (e.g. Gmail).`)
    return
  }

  const from = email.from || data.from
  const banner = `<div style="font-family:Arial,sans-serif;background:${COLORS.card2};border:1px solid ${COLORS.border};border-radius:10px;padding:12px 14px;margin:0 0 16px;font-size:13px;color:${COLORS.dark};">
    💬 Reply from <strong>${esc(from)}</strong>${order ? ` about <strong>${esc(order.product_type)}</strong>` : ''}.
    Hit Reply to answer them directly${order ? ` · <a href="${APP_URL}/dashboard/order/${order.id}" style="color:${COLORS.primary};font-weight:700;">Open order in the app →</a>` : ''}
  </div>`

  await sendEmail({
    to: forwardTo,
    replyTo: addressOf(from),
    subject: /^(re|fwd?):/i.test(subject) ? subject : `Re: ${subject}`,
    html: banner + (email.html || `<pre style="white-space:pre-wrap;font-family:inherit;">${esc(email.text || '')}</pre>`),
    text: email.text || undefined,
    headers: { 'X-Studio-Forwarded': '1' },
    attachments: attachments.map(a => ({ filename: a.filename, content: a.content, content_type: a.contentType })),
  })
}
