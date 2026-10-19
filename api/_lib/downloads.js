import { db, APP_URL, firstName } from './core.js'
import { layout, panel, button, sendEmail, esc } from './email.js'

// How long each signed download link works. Customers can always come back to
// /downloads/:orderId for a fresh link, so this only limits link sharing.
export const LINK_TTL_SECONDS = 60 * 60 * 24 // 24 hours

export const digitalLines = (order) =>
  (Array.isArray(order.shop_cart) ? order.shop_cart : []).filter(l => l.kind === 'digital' && l.digitalFilePath)

export const hasPhysicalLines = (order) =>
  (Array.isArray(order.shop_cart) ? order.shop_cart : []).some(l => l.kind !== 'digital')

export const isPaidInFull = (order) => Boolean(order.balance_paid) || (Number(order.price) > 0 && Number(order.amount_paid) >= Number(order.price) - 0.009)

// Signed URLs for every digital item on a paid order.
export async function signedDownloads(order) {
  const storage = db().storage.from('digital-products')
  const out = []
  for (const l of digitalLines(order)) {
    const { data, error } = await storage.createSignedUrl(l.digitalFilePath, LINK_TTL_SECONDS, { download: l.digitalFileName || true })
    out.push({ name: l.productName, fileName: l.digitalFileName, url: error ? null : data.signedUrl, error: error ? 'File unavailable — please contact us' : null })
  }
  return out
}

// Emails the buyer a link to their downloads page (the page mints fresh signed URLs on each visit).
export async function sendDownloadEmail(order) {
  const items = digitalLines(order)
  if (!items.length) return
  const list = items.map(l => `<li style="margin:4px 0;">${esc(l.productName)}${l.digitalFileName ? ` <span style="color:#999;">(${esc(l.digitalFileName)})</span>` : ''}</li>`).join('')
  await sendEmail({
    to: order.customer_email,
    subject: `Your download${items.length > 1 ? 's are' : ' is'} ready, ${firstName(order.customer_name)}! ✨`,
    html: layout({
      heading: 'Your downloads are ready!',
      body: `<p style="margin:0;">Thank you for your purchase! Your digital file${items.length > 1 ? 's are' : ' is'} ready.</p>
        ${panel('Included', `<ul style="margin:0;padding-left:18px;font-size:14px;">${list}</ul>`)}
        ${button('Download now →', `${APP_URL}/downloads/${order.id}`)}
        <p style="font-size:12px;color:#999;text-align:center;margin:0;">Save this email — you can come back to this link any time to download again.</p>`,
    }),
  })
}
