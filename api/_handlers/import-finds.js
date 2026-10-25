import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { db, requireMethod, requireAdmin, HttpError, BRAND } from '../_lib/core.js'
import { parseWithClaude } from '../_lib/anthropic.js'
import { cleanAmazonUrl } from '../../src/lib/finds.js'
import { FINDS } from '../../src/brand.js'

// Admin: turn her Amazon affiliate links (from her Linktree, or pasted) into draft finds.
// Names come from her Linktree button titles and the product words in Amazon's own link;
// the listing assistant writes a short name, "why I love it" options, a shelf and an icon.
// Nothing is published until she approves it.
const MAX_ITEMS = 40

const DraftSchema = z.object({
  items: z.array(z.object({
    index: z.number(),
    name: z.string(),
    notes: z.array(z.string()),
    shelf: z.string(),
    icon: z.string(),
  })),
})

export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const b = req.body || {}
  const supabase = db()

  let found = []
  if (b.linktree) found = await fromLinktree(String(b.linktree))
  if (b.text) found = found.concat(fromText(String(b.text)))
  found = found.map(x => ({ ...x, url: cleanAmazonUrl(x.url) })).filter(x => x.url)
  if (!found.length) throw new HttpError(400, b.linktree ? 'No Amazon links found on that Linktree' : 'No Amazon links found — paste links that start with https://amzn.to or https://www.amazon.com')

  // Skip links she already has.
  const { data: existing, error } = await supabase.from('finds').select('url')
  if (error) throw new HttpError(500, /draft|note_options|icon/.test(error.message) ? 'Run 20261030000000_finds_drafts.sql in Supabase first' : error.message)
  const have = new Set((existing || []).map(f => f.url))
  const seen = new Set()
  const items = found.filter(x => !have.has(x.url) && !seen.has(x.url) && seen.add(x.url)).slice(0, MAX_ITEMS)
  if (!items.length) return res.status(200).json({ added: 0, skipped: found.length })

  // Short links (amzn.to) redirect to a full Amazon URL whose path usually names the product.
  await Promise.all(items.map(async (x) => { x.words = await productWords(x.url) }))

  let drafts = []
  try {
    const out = await parseWithClaude({
      output_config: { effort: 'low', format: zodOutputFormat(DraftSchema) },
      messages: [{ role: 'user', content: prompt(items) }],
    })
    drafts = out.items
  } catch (e) {
    console.error('import-finds assistant failed:', e.message) // still import with her own titles
  }

  const shelves = new Set(FINDS.shelves.map(s => s.key))
  const rows = items.map((x, i) => {
    const d = drafts.find(y => y.index === i) || {}
    const notes = (d.notes || []).map(n => String(n).trim().slice(0, 300)).filter(Boolean).slice(0, 3)
    return {
      title: String(d.name || x.title || x.words || 'Amazon find').trim().slice(0, 120),
      note: notes[0] || null,
      note_options: notes.length ? notes : null,
      url: x.url,
      shelf: shelves.has(d.shelf) ? d.shelf : FINDS.shelves[0].key,
      icon: String(d.icon || '🛍️').slice(0, 8),
      draft: true,
      active: false,
      sort_order: i,
    }
  })
  const { error: insErr } = await supabase.from('finds').insert(rows)
  if (insErr) throw new HttpError(500, insErr.message)
  return res.status(200).json({ added: rows.length, skipped: found.length - rows.length })
}

// Linktree pages carry their links as JSON (__NEXT_DATA__); fall back to plain hrefs.
async function fromLinktree(raw) {
  const user = raw.replace(/^https?:\/\/(www\.)?linktr\.ee\//i, '').replace(/[/?#].*$/, '').trim()
  if (!/^[\w.-]{1,60}$/.test(user)) throw new HttpError(400, 'Enter a Linktree username, like create.live.ly')
  const resp = await fetch(`https://linktr.ee/${encodeURIComponent(user)}`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StudioApp/1.0)' } })
  if (!resp.ok) throw new HttpError(502, `Couldn’t open linktr.ee/${user} (${resp.status})`)
  const html = await resp.text()
  const out = []
  const json = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
  if (json) {
    try {
      const walk = (v) => {
        if (Array.isArray(v)) return v.forEach(walk)
        if (v && typeof v === 'object') {
          if (typeof v.url === 'string' && typeof v.title === 'string') out.push({ url: v.url, title: v.title })
          Object.values(v).forEach(walk)
        }
      }
      walk(JSON.parse(json))
    } catch { /* fall through to hrefs */ }
  }
  if (!out.length) for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) out.push({ url: m[1].replace(/&amp;/g, '&'), title: '' })
  return out
}

const fromText = (text) => (text.match(/https?:\/\/[^\s<>"']+/g) || []).map(url => ({ url, title: '' }))

// "https://www.amazon.com/Heat-Press-Pillow-Inches/dp/B0…" → "Heat Press Pillow Inches"
async function productWords(url) {
  let full = url
  if (/amzn\.to|a\.co/i.test(url)) {
    try {
      const r = await fetch(url, { method: 'HEAD', redirect: 'manual' })
      full = r.headers.get('location') || url
    } catch { /* keep the short link */ }
  }
  try {
    const parts = new URL(full).pathname.split('/').filter(Boolean)
    const i = parts.findIndex(p => p === 'dp' || p === 'gp')
    const slug = i > 0 ? parts[i - 1] : ''
    return /[a-z]/i.test(slug) && slug.length > 3 ? decodeURIComponent(slug).replace(/-/g, ' ') : ''
  } catch { return '' }
}

const prompt = (items) => `You help ${BRAND.ownerFirstName}, owner of ${BRAND.name} (${BRAND.location}), present her favorite Amazon finds on her own site. Her shop sells handmade stickers, 3D prints, custom gifts, journals and vendor essentials. Her voice: warm, real, a little playful — a friend sharing what she loves. No hype words ("amazing", "must-have", "game-changer"), no emojis inside the text.

For each item below you get the title she gave it on her Linktree and/or the product words from Amazon's link. Return for every item:
- "name": a short, appealing product name (max 45 characters) — clear about what it actually is. Don't invent brands, sizes or specs that aren't in the input.
- "notes": 2 or 3 different one-sentence lines (max 120 characters each) she could say about why she likes it. Write them as her recommendation, but DON'T claim specific facts you can't know (how long she's used it, how many she bought, results numbers). Focus on what it's good for and who'd love it.
- "shelf": exactly one of: ${FINDS.shelves.map(s => `"${s.key}" (${s.name})`).join(', ')}.
- "icon": one emoji that fits the item.
- "index": the item's number.

Items:
${items.map((x, i) => `${i}. Linktree title: ${x.title || '(none)'} | Amazon link words: ${x.words || '(none)'}`).join('\n')}`
