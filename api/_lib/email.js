import { BRAND, COLORS } from '../../src/brand.js'
import { MAKER_EMAIL } from './core.js'

// Resend needs a verified sending domain. Set EMAIL_FROM once the domain is verified,
// e.g. "[HER BUSINESS NAME] <orders@herdomain.com>".
const FROM = process.env.EMAIL_FROM || `${BRAND.name} <onboarding@resend.dev>`

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Escapes then keeps line breaks.
export const escBr = (s) => esc(s).replace(/\n/g, '<br/>')

export async function sendEmail({ to, subject, html, replyTo }) {
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
  if (!resp.ok) {
    const err = await resp.text()
    console.error('Resend error:', resp.status, err)
    throw new Error(`Email failed: ${err}`)
  }
  return resp.json()
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
  return `<div style="background:#f8f6f4;border-radius:10px;padding:16px;margin:18px 0;">
    ${title ? `<p style="font-size:11px;font-weight:700;color:${COLORS.accent};text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px;">${esc(title)}</p>` : ''}
    ${inner}
  </div>`
}

// Shared branded layout for every email.
export function layout({ heading, body, footer = true }) {
  return `
  <div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;">
    <div style="background:${COLORS.dark};padding:28px 24px;border-radius:12px 12px 0 0;text-align:center;">
      <p style="color:rgba(255,255,255,0.5);margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">${esc(BRAND.name)}</p>
      <h1 style="color:${COLORS.primary};margin:0;font-size:24px;font-weight:800;letter-spacing:-0.02em;">${esc(heading)}</h1>
    </div>
    <div style="background:#fff;padding:26px 24px;border:1px solid #f0f0f0;border-top:none;border-radius:0 0 12px 12px;font-size:15px;color:${COLORS.dark};line-height:1.7;">
      ${body}
    </div>
    ${footer ? `<p style="text-align:center;font-size:11px;color:#bbb;margin-top:16px;">${esc(BRAND.name)} · ${esc(BRAND.location)}</p>` : ''}
  </div>`
}
