import { Resend } from 'resend'
import { db, requireMethod, requireAdmin, HttpError } from '../_lib/core.js'
import { readInbound, storeAttachments } from '../_lib/inbound.js'

// Admin: re-read a customer reply from Resend and fill in its text/photos — for replies that
// arrived before HTML-only and pasted-photo emails were handled.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const key = process.env.RESEND_API_KEY
  if (!key) throw new HttpError(500, 'RESEND_API_KEY is not set')
  const supabase = db()
  const { data: row } = await supabase.from('email_log').select('*').eq('id', req.body?.id || '').eq('direction', 'in').maybeSingle()
  if (!row?.resend_email_id) throw new HttpError(404, 'That reply can’t be reloaded')

  const { data: email, error } = await new Resend(key).emails.receiving.get(row.resend_email_id)
  if (error || !email) throw new HttpError(502, 'Couldn’t reach the email service — try again in a minute')
  const { text, attachments } = await readInbound(email)
  const urls = row.attachment_urls?.length ? row.attachment_urls : await storeAttachments(supabase, attachments)
  const updates = { body_text: text || row.body_text || null, attachment_urls: urls.length ? urls : null }
  const { error: upErr } = await supabase.from('email_log').update(updates).eq('id', row.id)
  if (upErr) throw new HttpError(500, upErr.message)
  return res.status(200).json({ ...updates, empty: !updates.body_text && !urls.length })
}
