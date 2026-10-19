import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { enableAdminApp } from '../lib/pwa'
import { Loading, ui, Button } from './ui'

// Gate for /dashboard routes: must be signed in AND listed in admin_users.
export default function RequireAdmin({ children }) {
  const location = useLocation()
  const [state, setState] = useState('checking') // checking | ok | anon | forbidden

  useEffect(() => {
    enableAdminApp()
    let alive = true
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { if (alive) setState('anon'); return }
      const { data: isAdmin } = await supabase.rpc('is_admin')
      if (alive) setState(isAdmin ? 'ok' : 'forbidden')
    }
    check()
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setState('anon')
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  if (state === 'checking') return <Loading />
  if (state === 'anon') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (state === 'forbidden') {
    return (
      <div style={{ ...ui.wrap, textAlign: 'center', paddingTop: 80 }}>
        <h1 style={ui.h1}>Not an admin account</h1>
        <p style={{ ...ui.muted, margin: '12px 0 20px' }}>
          This login works, but it isn't listed in the <code>admin_users</code> table yet.
        </p>
        <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Sign out</Button>
      </div>
    )
  }
  return children
}
