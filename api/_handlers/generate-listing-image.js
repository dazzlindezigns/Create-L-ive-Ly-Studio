import crypto from 'crypto'
import { db, requireMethod, requireAdmin, HttpError, BRAND } from '../_lib/core.js'
import { storageUrlsOnly } from '../_lib/validate.js'

// Gemini image model (aka "Nano Banana"). Override with GEMINI_IMAGE_MODEL when Google ships a newer one.
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'
const MAX_SOURCE_BYTES = 10 * 1024 * 1024

const PALETTE = 'soft blush pink (#FFF1F3), dusty rose (#C96E88), warm cream and touches of gold'

export const STYLES = {
  studio: `a clean, bright e-commerce product photo on a seamless ${PALETTE.split(',')[0]} backdrop with soft natural light and a gentle shadow`,
  lifestyle: 'a bright, cozy lifestyle scene where the product is naturally in use, styled warmly and uncluttered, shallow depth of field',
  flatlay: `an overhead flat-lay styled with a few tasteful props in ${PALETTE}, plenty of breathing room around the product`,
  gift: `a gift-ready presentation with tissue paper, ribbon and a small blank gift tag in ${PALETTE}`,
  vendor: 'a polished vendor-market table display with a neutral linen cloth, soft daylight and a welcoming boutique feel',
  mockup: `a realistic print mockup showing the design as printed papers / prints, fanned or stacked on a desk styled in ${PALETTE}`,
}

// Admin: generate one styled listing image with Gemini and save it to the product-images bucket.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new HttpError(500, 'GEMINI_API_KEY is not set')

  const b = req.body || {}
  const style = STYLES[b.style] ? b.style : 'studio'
  const sourceUrl = storageUrlsOnly(b.sourceImageUrl ? [b.sourceImageUrl] : [], 'product-images')?.[0] || null
  const name = String(b.productName || '').trim().slice(0, 120)
  const notes = String(b.notes || '').trim().slice(0, 500)
  if (!sourceUrl && !name && !notes) throw new HttpError(400, 'Pick a product photo or describe the product')

  const parts = []
  if (sourceUrl) {
    const img = await fetch(sourceUrl)
    if (!img.ok) throw new HttpError(400, 'Could not load that product photo')
    const buf = Buffer.from(await img.arrayBuffer())
    if (buf.length > MAX_SOURCE_BYTES) throw new HttpError(400, 'That photo is too large (10 MB max)')
    parts.push({ inlineData: { mimeType: img.headers.get('content-type') || 'image/jpeg', data: buf.toString('base64') } })
  }

  // With a real photo, the product must stay exactly as made — only the scene changes.
  const prompt = sourceUrl
    ? `Create a professional shop listing photo for ${BRAND.name}. Use the attached photo of the product${name ? ` ("${name}")` : ''}. Keep the product itself EXACTLY as it appears — same shape, proportions, colors, text, logos and details; do not add, remove or redesign anything on it. Only change the background, lighting and staging to ${STYLES[style]}. ${notes ? `Context: ${notes}. ` : ''}Square composition, product centered and in sharp focus. No added text, watermarks or logos.`
    : `Create a professional shop listing image for ${BRAND.name}: ${name || 'a product'}${notes ? ` — ${notes}` : ''}. Show it as ${STYLES[style]}. Square composition, sharp focus. No added text, watermarks or logos.`
  parts.push({ text: prompt })

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
    }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    console.error('Gemini error:', resp.status, JSON.stringify(data).slice(0, 500))
    throw new HttpError(resp.status === 429 ? 429 : 502, data.error?.message || `Gemini error (${resp.status})`)
  }

  const out = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData
  if (!out) {
    const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason
    throw new HttpError(422, reason ? `Gemini didn't return an image (${reason}) — try another style or photo` : 'Gemini didn’t return an image — try again')
  }

  const ext = out.mimeType === 'image/jpeg' ? 'jpg' : 'png'
  const path = `ai/${Date.now()}-${crypto.randomUUID()}.${ext}`
  const supabase = db()
  const { error } = await supabase.storage.from('product-images')
    .upload(path, Buffer.from(out.data, 'base64'), { contentType: out.mimeType || 'image/png' })
  if (error) throw new HttpError(500, error.message)

  return res.status(200).json({ url: supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl, style })
}
