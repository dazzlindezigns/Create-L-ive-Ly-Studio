import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { requireMethod, requireAdmin, HttpError, BRAND } from '../_lib/core.js'
import { parseWithClaude } from '../_lib/anthropic.js'
import { storageUrlsOnly } from '../_lib/validate.js'
import { COLLECTIONS } from '../../src/brand.js'

const ListingSchema = z.object({
  title: z.string(),
  description: z.string(),
  options: z.array(z.string()),
  suggestedPrice: z.number().nullable(),
  priceNote: z.string(),
  missingInfo: z.array(z.string()),
})

// Admin: Claude drafts a shop listing from her photos + quick notes. She reviews and edits before saving.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const b = req.body || {}

  const notes = String(b.notes || '').trim().slice(0, 3000)
  const imageUrls = storageUrlsOnly(b.imageUrls, 'product-images')?.slice(0, 4) || []
  if (!notes && !String(b.name || '').trim() && !imageUrls.length) throw new HttpError(400, 'Add a few notes or a photo first')

  const collection = COLLECTIONS.find(c => c.key === b.collection)
  const isDigital = b.kind === 'digital'

  const prompt = `You write shop listings for ${BRAND.name}, a small custom studio in ${BRAND.location} run by ${BRAND.ownerFirstName}. Tagline: "${BRAND.tagline}." The studio makes 3D printed pieces, personalized gifts and keepsakes, custom stickers, brand merch, vendor essentials and digital papers.

Brand voice: warm, encouraging and purposeful — like a friend who makes beautiful things with care. Speak to who it's for and the moment it celebrates. Confident, never pushy; no hype words like "amazing", "must-have" or "game-changer", and no emojis.

Write a listing for this ${isDigital ? 'DIGITAL DOWNLOAD (nothing is shipped; the buyer receives a file)' : 'physical product'}:
- Working name: ${b.name || '(none yet — suggest one)'}
- Collection: ${collection ? `${collection.name} — ${collection.blurb}` : '(none)'}
- Current price: ${Number(b.price) > 0 ? `$${Number(b.price).toFixed(2)}` : '(not set)'}
- Her notes: ${notes || '(none — rely on the photos)'}
${imageUrls.length ? `- ${imageUrls.length} product photo(s) attached.` : '- No photos attached.'}

Rules:
- Only state facts from her notes or clearly visible in the photos. Never invent dimensions, materials, file formats, quantities or turnaround times. List anything a buyer would need that is missing in "missingInfo" (e.g. "exact size", "file format").
- "title": under 60 characters, clear and searchable, Title Case.
- "description": plain text, no markdown. A 2–3 sentence opening paragraph, a blank line, then a short "Details" list with each line starting with "• ". ${isDigital ? 'Include what the buyer receives and how they can use it, and a line that it is a digital download and nothing ships.' : 'Mention personalization only if her notes say it is offered.'}
- "options": choices the buyer picks from (sizes, colors, finishes) only if her notes mention them; otherwise an empty array.${isDigital ? ' Digital products have no options — return an empty array.' : ''}
- "suggestedPrice": a fair small-business retail price in USD, or null if there isn't enough to go on. "priceNote": one sentence explaining it.`

  const listing = await parseWithClaude({
    output_config: { effort: 'low', format: zodOutputFormat(ListingSchema) }, // low effort keeps it fast for an interactive button
    messages: [{
      role: 'user',
      content: [
        ...imageUrls.map(url => ({ type: 'image', source: { type: 'url', url } })),
        { type: 'text', text: prompt },
      ],
    }],
  })

  if (isDigital) listing.options = []
  return res.status(200).json(listing)
}
