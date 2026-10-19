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
  return `You are a pricing assistant for "${BRAND.name}", a small custom studio that makes 3D printed pieces, personalized gifts and keepsakes, brand merch (apparel, mugs, journals), vendor essentials (signs, displays, business accessories), and digital papers/designs.

Estimate realistic supply/material costs and labor for this custom work:
${description || '(see the attached images)'}

Guidelines:
- Return one entry in "items" per distinct item type. Set "qty" to how many of that item are being made.
- In supplyLines, "qty" is the TOTAL quantity of that material for the ENTIRE batch (e.g. 600 g of filament for 12 keychains), never per item.
- Typical small-studio costs: PLA/PETG filament $0.02–0.03/g (silk/specialty $0.03–0.05/g), resin $0.05–0.10/ml, magnets/keyrings/small hardware $0.10–0.75 each; sublimation blanks — 11 oz mug $2–4, 15 oz $3–5, tumbler $5–12, t-shirt $3–8, hoodie $12–20, journal $3–8; sublimation/HTV/DTF transfer $0.50–3.00 each; acrylic or wood blanks $1–8; packaging (boxes, tissue, bags, thank-you cards) $0.25–2.00 per order.
- Account for print time on 3D pieces as machine/electricity cost (~$0.25–0.50 per print hour) in supplyLines.
- Labor is $20–30/hr. Amortize design, setup, pressing, post-processing (sanding, painting, assembly) and packing time across the batch and express it as laborPerUnit.
- Digital-only work (designs, digital papers): no supplies; price the design time as labor.
- "reasoning" is one short sentence.`
}

function invoicePrompt(description) {
  return `You are a billing assistant for "${BRAND.name}", a small custom studio (3D prints, personalized gifts and keepsakes, brand merch, vendor essentials, digital designs). Create invoice line items for work that has been completed:
${description || '(see the attached images)'}

Use fair retail pricing for quality handmade custom goods from a small business. One line per distinct item or service; use the quantities mentioned. "reasoning" is one short sentence.`
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
