import { BRAND } from '../brand'
import { ui } from '../components/ui'

// Shown instead of a blank page when the site was built without its Supabase settings.
export default function SetupNeeded({ missing }) {
  return (
    <div style={{ ...ui.wrap, maxWidth: 520, paddingTop: 60 }}>
      <div style={ui.card}>
        <div style={ui.eyebrow}>{BRAND.name}</div>
        <h1 style={{ ...ui.h1, fontSize: 24, margin: '6px 0 10px' }}>Almost ready — setup needed</h1>
        <p style={{ color: 'var(--mid)', lineHeight: 1.6, fontSize: 14 }}>
          This site was built without its database settings. In Vercel → Project → Settings → Environment Variables, add:
        </p>
        <ul style={{ margin: '12px 0 12px 20px', fontFamily: 'monospace', fontSize: 14, lineHeight: 1.8 }}>
          {missing.map(m => <li key={m}>{m}</li>)}
        </ul>
        <p style={{ color: 'var(--mid)', lineHeight: 1.6, fontSize: 14 }}>
          Then go to Deployments → latest deployment → ⋯ → <strong>Redeploy</strong>. These values are read when the site is built,
          so adding them without redeploying won't fix this page.
        </p>
      </div>
    </div>
  )
}
