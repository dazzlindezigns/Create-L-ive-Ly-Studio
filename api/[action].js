// Single serverless entry point for every /api/<action> route.
// Vercel's Hobby plan allows 12 functions per deployment, so instead of one file per
// endpoint we dispatch to api/_handlers/<action>.js (underscore folders are not deployed
// as their own functions). /api/square-webhook stays separate because it needs the raw body.
import { HttpError } from './_lib/core.js'

const routes = {
  // Public (customer-facing)
  'create-order':        () => import('./_handlers/create-order.js'),
  'get-upload-url':      () => import('./_handlers/get-upload-url.js'),
  'get-order':           () => import('./_handlers/get-order.js'),
  'accept-quote':        () => import('./_handlers/accept-quote.js'),
  'create-checkout':     () => import('./_handlers/create-checkout.js'),
  'proof-response':      () => import('./_handlers/proof-response.js'),
  'get-products':        () => import('./_handlers/get-products.js'),
  'get-settings':        () => import('./_handlers/get-settings.js'),
  'validate-discount':   () => import('./_handlers/validate-discount.js'),
  'create-shop-order':   () => import('./_handlers/create-shop-order.js'),
  'push-config':         () => import('./_handlers/push-config.js'),
  'get-downloads':       () => import('./_handlers/get-downloads.js'),
  // Admin (require a signed-in admin)
  'send-quote':          () => import('./_handlers/send-quote.js'),
  'send-proof':          () => import('./_handlers/send-proof.js'),
  'mark-shipped':        () => import('./_handlers/mark-shipped.js'),
  'easypost-rates':      () => import('./_handlers/easypost-rates.js'),
  'easypost-buy':        () => import('./_handlers/easypost-buy.js'),
  'estimate-from-description': () => import('./_handlers/estimate-from-description.js'),
  'create-invoice':      () => import('./_handlers/create-invoice.js'),
  'save-settings':       () => import('./_handlers/save-settings.js'),
  'save-push-sub':       () => import('./_handlers/save-push-sub.js'),
  'test-push':           () => import('./_handlers/test-push.js'),
  'send-downloads':      () => import('./_handlers/send-downloads.js'),
}

export default async function handler(req, res) {
  const load = routes[req.query.action]
  if (!load) return res.status(404).json({ error: 'Unknown endpoint' })
  try {
    const mod = await load()
    return await mod.default(req, res)
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    if (status >= 500) console.error(`/api/${req.query.action} failed:`, e)
    if (!res.headersSent) res.status(status).json({ error: e.message || 'Unexpected server error' })
  }
}
