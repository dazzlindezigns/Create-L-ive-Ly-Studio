import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { requireMethod, requireAdmin, HttpError, BRAND } from '../_lib/core.js'

const MODEL = 'claude-opus-4-8'

const QuoteSchema = z.object({
  items: z.array(z.object({
    name: z.string(),
    qty: z.number(),
    supplyLines: z.array(z.object({
      description: z.string(),
      qty: z.number(),        // TOTAL quantity for the whole batch, not per item
      unitCost: z.number(),
    })),
    laborPerUnit: z.number(),
    reasoning: z.string(),
  })),
})

const InvoiceSchema = z.object({
  lines: z.array(z.object({
    description: z.string(),
    qty: z.number(),
    unitPrice: z.number(),
    reasoning: z.string(),
  })),
})

const ALLOWED_MEDIA = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function quotePrompt(description) {
  return `You are a pricing assistant for "${BRAND.name}", a small custom sticker and label business that also runs sticker bar experiences at events.

Estimate realistic supply/material costs and labor for this custom work:
${description || '(see the attached images)'}

Guidelines:
- Return one entry in "items" per distinct item type. Set "qty" to how many of that item are being made.
- In supplyLines, "qty" is the TOTAL quantity of that material for the ENTIRE batch (e.g. 4 sheets of vinyl for 200 stickers), never per item.
- Typical small-shop supply costs: printable vinyl sheets $0.60–1.50/sheet (8.5"×11"), holographic or clear vinyl $1.20–2.50/sheet, cold laminate $0.40–1.00/sheet, ink $0.05–0.20 per sheet printed, packaging (cello sleeves, backing cards, mailers) $0.05–0.75 each, die-cut blade wear $0.01–0.03 per sticker.
- A letter sheet typically yields ~20 3" stickers, ~35 2" stickers, or ~9 4" stickers.
- Sticker bar events: include sticker inventory, sheets/backing, display supplies, travel, and setup/teardown time.
- Labor is $18–30/hr. Amortize design, setup, weeding and packing time across the batch and express it as laborPerUnit.
- "reasoning" is one short sentence.`
}

function invoicePrompt(description) {
  return `You are a billing assistant for "${BRAND.name}", a small custom sticker and label business. Create invoice line items for work that has been completed:
${description || '(see the attached images)'}

Use fair retail pricing for quality custom stickers and labels from a small business. One line per distinct item or service; use the quantities mentioned. "reasoning" is one short sentence.`
}

export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)

  const { description = '', images = [], mode = 'quote' } = req.body || {}
  const imageList = (Array.isArray(images) ? images : [])
    .filter(i => i?.base64 && ALLOWED_MEDIA.has(i.mediaType))
    .slice(0, 4)
  if (!String(description).trim() && !imageList.length) throw new HttpError(400, 'Provide a description or image')
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(500, 'ANTHROPIC_API_KEY is not set')

  const isQuote = mode !== 'invoice'
  const client = new Anthropic()

  let response
  try {
    response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(isQuote ? QuoteSchema : InvoiceSchema),
      },
      messages: [{
        role: 'user',
        content: [
          ...imageList.map(img => ({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } })),
          { type: 'text', text: isQuote ? quotePrompt(description) : invoicePrompt(description) },
        ],
      }],
    })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'AI estimator is busy — try again in a minute')
    if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, `AI request rejected: ${e.message}`)
    if (e instanceof Anthropic.APIError) throw new HttpError(502, `AI service error (${e.status})`)
    throw e
  }

  if (response.stop_reason === 'refusal') throw new HttpError(422, 'The AI declined this request — try rewording the description')
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new HttpError(502, 'The AI response was incomplete — try a shorter description')

  return res.status(200).json(response.parsed_output)
}
