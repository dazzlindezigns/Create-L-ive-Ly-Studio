import { requireMethod } from '../_lib/core.js'

// /api/health — setup check. Says which deploy is live and whether the Supabase keys match
// the Supabase URL, without revealing any key. Open it in a browser when something says "Invalid API key".

const refFromUrl = (url) => { try { return new URL(url).hostname.split('.')[0] } catch { return null } }

function describeKey(raw) {
  if (!raw) return { set: false }
  const key = String(raw)
  const out = { set: true, extraSpacesOrQuotes: key !== key.trim() || /^["']|["']$/.test(key.trim()), spaceInside: /\s/.test(key.trim()) }
  const k = key.trim().replace(/^["']|["']$/g, '')
  if (k.startsWith('sb_secret_')) return { ...out, type: 'secret key (sb_secret_…)' }
  if (k.startsWith('sb_publishable_')) return { ...out, type: 'publishable key (sb_publishable_…)' }
  const parts = k.split('.')
  if (parts.length === 3) {
    try {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      // A legacy key's signature is 43 characters; anything else means it was cut off or extra was pasted.
      return { ...out, type: `legacy JWT key (role: ${claims.role})`, role: claims.role, project: claims.ref || null, issued: claims.iat || null, signatureOk: parts[2].length === 43 }
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
  const missingPush = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'].filter(k => !process.env[k])
  if (missingPush.length) problems.push(`Notifications need ${missingPush.join(', ')} in Vercel.`)
  if (!browserKey.set) problems.push('VITE_SUPABASE_ANON_KEY is not set.')
  if (browserKey.extraSpacesOrQuotes) problems.push('VITE_SUPABASE_ANON_KEY has extra spaces or quote marks around it.')
  if (browserKey.role && browserKey.role !== 'anon') problems.push(`VITE_SUPABASE_ANON_KEY is the "${browserKey.role}" key. Use the anon (publishable) key — never the secret one in the browser.`)
  if (browserKey.project && project && browserKey.project !== project) problems.push(`VITE_SUPABASE_ANON_KEY belongs to project "${browserKey.project}" but the URL is project "${project}".`)

  if (serverKey.spaceInside) problems.push('SUPABASE_SERVICE_ROLE_KEY has a space or line break inside it — re-copy it as one line.')
  if (serverKey.signatureOk === false) problems.push('SUPABASE_SERVICE_ROLE_KEY looks cut off or has extra characters at the end — copy it again in full.')

  // Real round trips. Plain REST calls, so Supabase's actual error text comes back.
  const probe = async (key) => {
    try {
      const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/products?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
      if (r.ok) return { ok: true }
      const body = await r.text()
      let msg = body
      try { const j = JSON.parse(body); msg = j.message || j.msg || j.error || body } catch { /* keep text */ }
      return { ok: false, msg: `${r.status} ${String(msg).slice(0, 200)}`.trim() }
    } catch (e) { return { ok: false, msg: e.message } }
  }
  let database = 'not tested'
  if (url && serverKey.set) {
    const r = await probe(String(serverKeyRaw).trim().replace(/^["']|["']$/g, ''))
    database = r.ok ? 'ok — server key accepted' : `error: ${r.msg}`
    if (!r.ok) {
      problems.push(`Supabase rejected SUPABASE_SERVICE_ROLE_KEY: ${r.msg}`)
      if (serverKey.issued && browserKey.issued && serverKey.issued !== browserKey.issued) {
        problems.push('The service_role key was issued at a different time than the anon key, so it is probably an old copy. Copy it again from Supabase → Project Settings → API Keys.')
      }
    }
  }
  let browserDatabase = 'not tested'
  if (url && browserKey.set) {
    const r = await probe(String(process.env.VITE_SUPABASE_ANON_KEY).trim())
    browserDatabase = r.ok ? 'ok — browser key accepted' : `error: ${r.msg}`
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
    browserDatabase,
    notifications: missingPush.length ? 'not set up' : 'keys set',
    note: 'Changing Vercel environment variables only takes effect after a redeploy. VITE_ variables are built into the site, so they need a redeploy too.',
  })
}
