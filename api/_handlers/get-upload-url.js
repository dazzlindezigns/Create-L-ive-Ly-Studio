import crypto from 'crypto'
import { db, requireMethod, requireAdmin, HttpError } from '../_lib/core.js'

const PUBLIC_BUCKETS = new Set(['order-files'])
const ADMIN_BUCKETS = new Set(['order-proofs', 'product-images', 'digital-products'])
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'svg', 'pdf', 'ai', 'eps', 'psd', 'zip'])
// Digital products: printables, cut files, fonts, templates, etc.
const DIGITAL_EXT = new Set([...ALLOWED_EXT, 'dxf', 'studio3', 'procreate', 'brushset', 'ttf', 'otf', 'epub', 'mp4', 'mp3', 'docx', 'xlsx', 'pptx', 'txt', 'csv'])

export default async function handler(req, res) {
  requireMethod(req, 'POST')
  const { filename, bucket = 'order-files' } = req.body || {}
  if (!filename) throw new HttpError(400, 'filename required')
  if (ADMIN_BUCKETS.has(bucket)) await requireAdmin(req)
  else if (!PUBLIC_BUCKETS.has(bucket)) throw new HttpError(400, 'Unknown bucket')

  const ext = String(filename).split('.').pop().toLowerCase()
  if (!(bucket === 'digital-products' ? DIGITAL_EXT : ALLOWED_EXT).has(ext)) throw new HttpError(400, `.${ext} files aren't supported — use PNG, JPG, PDF, SVG, AI, EPS, PSD or ZIP`)

  const path = `uploads/${Date.now()}-${crypto.randomUUID()}.${ext}`
  const supabase = db()
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path)
  if (error) throw new HttpError(500, error.message)

  // digital-products is private: only the path is returned, never a public URL.
  const publicUrl = bucket === 'digital-products' ? null : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
  return res.status(200).json({ signedUrl: data.signedUrl, token: data.token, path, publicUrl })
}
