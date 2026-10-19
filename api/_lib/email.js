import { BRAND, COLORS } from '../../src/brand.js'
import { MAKER_EMAIL, APP_URL, db } from './core.js'

// Resend needs a verified sending domain. Set EMAIL_FROM once the domain is verified,
// e.g. "Create(L)ive(Ly) Studio <orders@createlivelyinc.com>".
const FROM = process.env.EMAIL_FROM || `${BRAND.name} <onboarding@resend.dev>`

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Escapes then keeps line breaks.
export const escBr = (s) => esc(s).replace(/\n/g, '<br/>')

// Sends through Resend. Pass `log: { orderId, kind, bodyText }` for customer emails so they
// show in the order's email history; failures are logged too, then re-thrown.
export async function sendEmail({ to, subject, html, replyTo, log }) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('RESEND_API_KEY not set — skipping email:', subject)
    return { skipped: true }
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: Array.isArray(to) ? to : [to],
      reply_to: replyTo || MAKER_EMAIL || undefined,
      subject,
      html,
    }),
  })
  const data = resp.ok ? await resp.json().catch(() => ({})) : null
  const err = resp.ok ? null : await resp.text()
  if (log) await logEmail({ ...log, to, subject, resendId: data?.id, error: err })
  if (!resp.ok) {
    console.error('Resend error:', resp.status, err)
    throw new Error(`Email failed: ${err}`)
  }
  return data
}

async function logEmail({ orderId, kind, bodyText, to, subject, resendId, error }) {
  try {
    await db().from('email_log').insert({
      order_id: orderId || null,
      to_email: Array.isArray(to) ? to.join(', ') : to,
      subject,
      kind,
      body_text: bodyText || null,
      resend_id: resendId || null,
      status: error ? 'failed' : 'sent',
      error: error ? String(error).slice(0, 500) : null,
    })
  } catch (e) { console.error('email_log insert failed', e) }
}

// Email to the business owner. Never throws — a failed notification must not fail the request.
export async function emailMaker(subject, html, replyTo) {
  if (!MAKER_EMAIL) return
  try { await sendEmail({ to: MAKER_EMAIL, subject, html, replyTo }) } catch (e) { console.error(e) }
}

export function button(label, url, color = COLORS.primary) {
  return `<a href="${esc(url)}" style="display:block;background:${color};color:#fff;text-decoration:none;text-align:center;padding:15px 24px;border-radius:50px;font-weight:700;font-size:15px;margin:20px 0 8px;">${esc(label)}</a>`
}

export function rows(pairs) {
  const tr = pairs
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<tr><td style="padding:7px 0;color:#999;font-size:13px;width:120px;vertical-align:top;">${esc(k)}</td><td style="padding:7px 0;font-size:13px;color:${COLORS.dark};line-height:1.5;">${v}</td></tr>`)
    .join('')
  return `<table style="width:100%;border-collapse:collapse;">${tr}</table>`
}

export function panel(title, inner) {
  return `<div style="background:${COLORS.card2};border-radius:10px;padding:16px;margin:18px 0;">
    ${title ? `<p style="font-size:11px;font-weight:700;color:${COLORS.primary};text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px;">${esc(title)}</p>` : ''}
    ${inner}
  </div>`
}

// Shared branded layout for every email — her logo on the soft pink from her storefront.
export function layout({ heading, body, footer = true }) {
  return `
  <div style="font-family:Montserrat,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:${COLORS.bg};">
    <div style="background:${COLORS.card2};padding:26px 24px 22px;border-radius:16px 16px 0 0;text-align:center;border:1px solid ${COLORS.border};border-bottom:none;">
      <img src="${APP_URL}${BRAND.logo}" alt="${esc(BRAND.name)}" width="190" style="width:190px;max-width:70%;height:auto;display:block;margin:0 auto 14px;" />
      <h1 style="font-family:'Playfair Display',Georgia,serif;color:${COLORS.dark};margin:0;font-size:25px;font-weight:600;">${esc(heading)}</h1>
    </div>
    <div style="background:#fff;padding:26px 24px;border:1px solid ${COLORS.border};border-top:none;border-radius:0 0 16px 16px;font-size:15px;color:${COLORS.dark};line-height:1.7;">
      ${body}
    </div>
    ${footer ? `<p style="text-align:center;font-size:11px;color:${COLORS.muted};margin-top:16px;letter-spacing:0.08em;text-transform:uppercase;">${esc(BRAND.name)} · ${esc(BRAND.location)}</p>` : ''}
  </div>`
}
