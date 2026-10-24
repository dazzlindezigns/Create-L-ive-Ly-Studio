import { db, requireMethod, HttpError, APP_URL, BRAND } from '../_lib/core.js'
import { commissionFor, partnerTotals } from '../../src/lib/affiliates.js'
import { PARTNER_PROGRAM } from '../../src/brand.js'

// A partner's private stats page (/partner/:token). The token is the secret; no customer details are returned.
export default async function handler(req, res) {
  requireMethod(req, 'GET')
  const token = String(req.query.token || '')
  if (!/^[0-9a-f-]{36}$/i.test(token)) throw new HttpError(404, 'Link not found')
  const supabase = db()
  const { data: p } = await supabase.from('affiliates').select('*').eq('token', token).maybeSingle()
  if (!p) throw new HttpError(404, 'Link not found')

  const [{ data: orders }, { data: payouts }, { data: products }] = await Promise.all([
    supabase.from('orders').select('id, created_at, status, price, amount_paid, refunded_amount, balance_paid, commission, commission_payout_id')
      .eq('affiliate_id', p.id).order('created_at', { ascending: false }).limit(500),
    supabase.from('affiliate_payouts').select('created_at, amount').eq('affiliate_id', p.id).order('created_at', { ascending: false }),
    supabase.from('products').select('id, name, image_urls').eq('active', true).order('sort_order').order('created_at'),
  ])

  const sales = (orders || []).map(o => ({ date: o.created_at, ...commissionFor(o) })).filter(s => s.state !== 'void')
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    name: p.name,
    code: p.code,
    rate: Number(p.rate),
    active: p.active,
    clicks: p.clicks || 0,
    ownDiscount: Number(p.own_discount ?? 25),
    payoutMethod: p.payout_method || null,
    payoutHandle: p.payout_handle || null,
    program: PARTNER_PROGRAM.name,
    business: BRAND.name,
    siteUrl: APP_URL,
    totals: partnerTotals(orders || []),
    sales: sales.slice(0, 100),
    payouts: (payouts || []).map(x => ({ date: x.created_at, amount: Number(x.amount) })),
    products: (products || []).map(x => ({ id: x.id, name: x.name, image: x.image_urls?.[0] || null })),
  })
}
