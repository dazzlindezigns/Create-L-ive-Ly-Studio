import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { requireMethod, requireAdmin, getOrder, HttpError, BRAND } from '../_lib/core.js'
import { parseWithClaude } from '../_lib/anthropic.js'
import { fmt } from '../../src/lib/money.js'

const DraftSchema = z.object({ subject: z.string(), body: z.string() })

// Admin: Claude turns her rough notes (or a template she started) into a polished customer email.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const b = req.body || {}
  const order = await getOrder(b.orderId)
  const draft = String(b.draft || '').trim().slice(0, 5000)
  if (!draft) throw new HttpError(400, 'Jot down what you want to say first')

  const facts = [
    `Customer first name: ${String(order.customer_name || '').split(' ')[0]}`,
    `Order: ${order.product_type}${order.need_by ? ` — needed by ${order.need_by}` : ''}`,
    `Status: ${order.status}`,
    order.price != null ? `Total: ${fmt(order.price)}; paid so far: ${fmt(order.amount_paid || 0)}` : 'Not quoted yet',
    order.tracking_number ? `Shipped via ${order.shipping_carrier || 'carrier'}, tracking ${order.tracking_number}` : null,
  ].filter(Boolean).join('\n')

  const prompt = `You help ${BRAND.ownerFirstName}, owner of ${BRAND.name} (a custom studio in ${BRAND.location}), write emails to her customers.

Her voice: warm, personal and encouraging, with clear next steps. Friendly but professional. Short paragraphs, no corporate filler, no hype, at most one emoji. Sign off with her first name, "${BRAND.ownerFirstName}".

Order facts (use only what's relevant; never invent dates, prices or promises that aren't in her notes or these facts):
${facts}

Her draft / notes:
"""
${draft}
"""

${b.subject ? `Her subject line so far: "${String(b.subject).slice(0, 200)}"` : ''}

Rewrite this into a ready-to-send email. Keep every specific detail she gave. If her notes leave a blank she must fill (like a new date), keep a clear [bracketed] placeholder rather than guessing. Plain text body, no markdown; a link button to the order page is added separately, so don't paste URLs.`

  const out = await parseWithClaude({
    output_config: { effort: 'low', format: zodOutputFormat(DraftSchema) },
    messages: [{ role: 'user', content: prompt }],
  })
  return res.status(200).json(out)
}
