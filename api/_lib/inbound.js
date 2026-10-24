import crypto from 'crypto'
import PostalMime from 'postal-mime'

// Reading customer replies (Resend inbound). Shared by api/resend-webhook.js and the
// order page's "Load message" (api/_handlers/reload-reply.js).
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
// Inline images smaller than this are usually signature logos / social icons, not photos.
const MIN_INLINE_IMAGE_BYTES = 15 * 1024

// Many phone mail apps (Yahoo, Outlook) send HTML only, so fall back to the HTML version.
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Keep just their new message, not the copy of her email quoted underneath.
export function trimQuoted(text) {
  const t = String(text || '')
  const cut = t.search(/\n\s*(On .{4,200}wrote:|-{2,}\s*Original Message|From: .+\n(Sent|Date): |Sent from Yahoo Mail|Get Outlook for)/i)
  const main = cut > 0 ? t.slice(0, cut).trim() : t.trim()
  return main || t.trim()
}

// → { text, attachments: [{ filename, content (base64), contentType }] }
export async function readInbound(email) {
  let text = email.text || htmlToText(email.html)
  const attachments = []
  // The raw message has the real files (the API only lists them) and a text/HTML fallback.
  if (email.raw?.download_url && (email.attachments?.length || !text)) {
    const raw = await fetch(email.raw.download_url)
    if (raw.ok) {
      const parsed = await PostalMime.parse(Buffer.from(await raw.arrayBuffer()), { attachmentEncoding: 'base64' })
      if (!text) text = parsed.text || htmlToText(parsed.html)
      for (const a of parsed.attachments || []) {
        if (!a.content) continue
        const size = Buffer.byteLength(a.content, 'base64')
        if (size > MAX_ATTACHMENT_BYTES) continue
        // Photos pasted into the message body arrive "inline" — keep them, but skip tiny logos.
        if (a.disposition === 'inline' && !(/^image\//.test(a.mimeType || '') && size >= MIN_INLINE_IMAGE_BYTES)) continue
        const ext = (a.mimeType || '').split('/')[1]?.replace('jpeg', 'jpg') || 'bin'
        attachments.push({ filename: a.filename || `photo.${ext}`, content: a.content, contentType: a.mimeType })
      }
    }
  }
  return { text: trimQuoted(text).slice(0, 20000), attachments }
}

// Saves attachments to the public order-files bucket so the order page can show them.
export async function storeAttachments(supabase, attachments) {
  const urls = []
  for (const a of attachments) {
    const safe = a.filename.replace(/[^\w.-]+/g, '_').slice(-80)
    const path = `inbound/${Date.now()}-${crypto.randomUUID()}-${safe}`
    const { error } = await supabase.storage.from('order-files').upload(path, Buffer.from(a.content, 'base64'), { contentType: a.contentType })
    if (!error) urls.push(supabase.storage.from('order-files').getPublicUrl(path).data.publicUrl)
  }
  return urls
}
