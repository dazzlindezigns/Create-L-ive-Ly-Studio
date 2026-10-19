import { createClient } from '@supabase/supabase-js'
import { requireMethod } from '../_lib/core.js'

// /api/health — setup check. Says which deploy is live and whether the Supabase keys match
// the Supabase URL, without revealing any key. Open it in a browser when something says "Invalid API key".

const refFromUrl = (url) => { try { return new URL(url).hostname.split('.')[0] } catch { return null } }

function describeKey(raw) {
  if (!raw) return { set: false }
  const key = String(raw)
  const out = { set: true, extraSpacesOrQuotes: key !== key.trim() || /^["']|["']$/.test(key.trim()) }
  const k = key.trim().replace(/^["']|["']$/g, '')
  if (k.startsWith('sb_secret_')) return { ...out, type: 'secret key (sb_secret_…)' }
  if (k.startsWith('sb_publishable_')) return { ...out, type: 'publishable key (sb_publishable_…)' }
  const parts = k.split('.')
  if (parts.length === 3) {
    try {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      return { ...out, type: `legacy JWT key (role: ${claims.role})`, role: claims.role, project: claims.ref || null }
    } catch { /* fall through */ }
  }
  return { ...out, type: 'unrecognized — not a Supabase key' }
}

export default async function handler(req, res) {
  requireMethod(req, 'GET')
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serverKeyRaw = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  const project = refFromUrl(url)
  const serverKey = describeKey(serverKeyRaw)
  const browserKey = describeKey(process.env.VITE_SUPABASE_ANON_KEY)

  const problems = []
  if (!url) problems.push('SUPABASE_URL / VITE_SUPABASE_URL is not set.')
  if (process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL && refFromUrl(process.env.SUPABASE_URL) !== refFromUrl(process.env.VITE_SUPABASE_URL)) {
    problems.push('SUPABASE_URL and VITE_SUPABASE_URL point to different Supabase projects.')
  }
  if (!serverKey.set) problems.push('SUPABASE_SERVICE_ROLE_KEY is not set.')
  if (serverKey.extraSpacesOrQuotes) problems.push('SUPABASE_SERVICE_ROLE_KEY has extra spaces or quote marks around it — paste just the key.')
  if (serverKey.role && serverKey.role !== 'service_role') problems.push(`SUPABASE_SERVICE_ROLE_KEY is the "${serverKey.role}" key. Use the service_role (secret) key.`)
  if (serverKey.type?.startsWith('publishable')) problems.push('SUPABASE_SERVICE_ROLE_KEY is the publishable key. Use the secret key.')
  if (serverKey.project && project && serverKey.project !== project) problems.push(`SUPABASE_SERVICE_ROLE_KEY belongs to project "${serverKey.project}" but the URL is project "${project}".`)
  if (!browserKey.set) problems.push('VITE_SUPABASE_ANON_KEY is not set.')
  if (browserKey.extraSpacesOrQuotes) problems.push('VITE_SUPABASE_ANON_KEY has extra spaces or quote marks around it.')
  if (browserKey.role && browserKey.role !== 'anon') problems.push(`VITE_SUPABASE_ANON_KEY is the "${browserKey.role}" key. Use the anon (publishable) key — never the secret one in the browser.`)
  if (browserKey.project && project && browserKey.project !== project) problems.push(`VITE_SUPABASE_ANON_KEY belongs to project "${browserKey.project}" but the URL is project "${project}".`)

  // Real round trip with the server key.
  let database = 'not tested'
  if (url && serverKey.set) {
    try {
      const client = createClient(url, String(serverKeyRaw).trim(), { auth: { persistSession: false } })
      const { count, error } = await client.from('products').select('id', { count: 'exact', head: true })
      database = error ? `error: ${error.message}` : `ok — ${count ?? 0} products`
      if (error) problems.push(`Supabase query failed: ${error.message}`)
    } catch (e) {
      database = `error: ${e.message}`
      problems.push(`Could not reach Supabase: ${e.message}`)
    }
  }

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    ok: problems.length === 0,
    problems,
    deployedCommit: (process.env.VERCEL_GIT_COMMIT_SHA || 'unknown').slice(0, 7),
    supabaseProject: project,
    serverKey: { set: serverKey.set, type: serverKey.type, project: serverKey.project },
    browserKey: { set: browserKey.set, type: browserKey.type, project: browserKey.project },
    database,
    note: 'Changing Vercel environment variables only takes effect after a redeploy. VITE_ variables are built into the site, so they need a redeploy too.',
  })
}
