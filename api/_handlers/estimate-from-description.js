import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { requireMethod, requireAdmin, HttpError, BRAND } from '../_lib/core.js'
import { parseWithClaude } from '../_lib/anthropic.js'

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
  return `You are a pricing assistant for "${BRAND.name}", a small custom studio that makes 3D printed pieces, personalized gifts and keepsakes, custom stickers and labels, brand merch (apparel, mugs, journals), vendor essentials (signs, displays, business accessories), and digital papers/designs. It also runs a Sticker Bar: an on-site event where guests build their own sticker creations.

Estimate realistic supply/material costs and labor for this custom work:
${description || '(see the attached images)'}

Guidelines:
- Return one entry in "items" per distinct item type. Set "qty" to how many of that item are being made.
- In supplyLines, "qty" is the TOTAL quantity of that material for the ENTIRE batch (e.g. 600 g of filament for 12 keychains), never per item.
- Typical small-studio costs: PLA/PETG filament $0.02–0.03/g (silk/specialty $0.03–0.05/g), resin $0.05–0.10/ml, magnets/keyrings/small hardware $0.10–0.75 each; sublimation blanks — 11 oz mug $2–4, 15 oz $3–5, tumbler $5–12, t-shirt $3–8, hoodie $12–20, journal $3–8; sublimation/HTV/DTF transfer $0.50–3.00 each; acrylic or wood blanks $1–8; packaging (boxes, tissue, bags, thank-you cards) $0.25–2.00 per order.
- Stickers: printable vinyl $0.60–1.50 per letter sheet (holographic/clear $1.20–2.50), laminate $0.40–1.00/sheet, ink $0.05–0.20/sheet; a sheet yields ~20 3" or ~35 2" stickers.
- Sticker Bar events: "qty" is the number of guests. Include per-guest sticker inventory (typically 8–15 stickers each), sheets/backing cards, take-home bags, display and table supplies, and mileage. Labor covers prep, setup/teardown and hosting time for the whole event.
- Account for print time on 3D pieces as machine/electricity cost (~$0.25–0.50 per print hour) in supplyLines.
- Labor is $20–30/hr. Amortize design, setup, pressing, post-processing (sanding, painting, assembly) and packing time across the batch and express it as laborPerUnit.
- Digital-only work (designs, digital papers): no supplies; price the design time as labor.
- "reasoning" is one short sentence.`
}

function invoicePrompt(description) {
  return `You are a billing assistant for "${BRAND.name}", a small custom studio (3D prints, personalized gifts and keepsakes, custom stickers, Sticker Bar events, brand merch, vendor essentials, digital designs). Create invoice line items for work that has been completed:
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
  const isQuote = mode !== 'invoice'
  const output = await parseWithClaude({
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

  return res.status(200).json(output)
}
