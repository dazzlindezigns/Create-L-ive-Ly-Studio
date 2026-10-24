import { db, APP_URL, BRAND, firstName } from './core.js'
import { layout, rows, panel, button, sendEmail, esc } from './email.js'
import { PARTNER_PROGRAM } from '../../src/brand.js'

// Welcome email for a new LiveLy Circle partner, with their private page link. Also used to resend it.
export async function sendPartnerWelcome(p) {
  const page = `${APP_URL}/partner/${p.token}`
  const pay = p.payout_method && p.payout_handle ? `${esc(p.payout_method)} (${esc(p.payout_handle)})` : 'Cash App, Zelle, PayPal or Venmo — add yours on your page'
  await sendEmail({
    to: p.email,
    subject: `Welcome to ${PARTNER_PROGRAM.name}, ${firstName(p.name)}! 💕`,
    html: layout({
      heading: `Welcome to ${esc(PARTNER_PROGRAM.name)}!`,
      body: `<p style="margin:0 0 14px;">Hey ${esc(firstName(p.name))}! ${PARTNER_PROGRAM.wave} ${esc(BRAND.ownerFirstName)} added you as a partner of <strong>${esc(BRAND.name)}</strong>. Share the love and earn while you do it.</p>
        ${panel('How it works', rows([
          ['Your link', `<a href="${APP_URL}/?ref=${esc(p.code)}">${esc(APP_URL.replace(/^https?:\/\//, ''))}/?ref=${esc(p.code)}</a>`],
          ['You earn', `<strong>${Number(p.rate)}%</strong> of every purchase made through your links`],
          ['Your perk', `<strong>${Number(p.own_discount ?? 25)}% off</strong> your own orders — tap “Shop for myself” on your page`],
          ['Getting paid', `Once an order is complete, ${esc(BRAND.ownerFirstName)} pays you by ${pay}`],
        ]))}
        <p style="margin:0 0 6px;font-size:14px;">Your partner page has your links for every product, your clicks and your earnings.</p>
        ${button('Open your partner page →', page)}
        <p style="font-size:12px;color:#999;text-align:center;margin:0;">Save this email — your page link is private and just for you. <a href="${APP_URL}/terms#partners">Partner terms</a></p>`,
    }),
  })
  await db().from('affiliates').update({ welcomed_at: new Date().toISOString() }).eq('id', p.id)
}
