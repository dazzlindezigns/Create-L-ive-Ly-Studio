import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BRAND } from '../brand'
import { ui, Button, Field, Input } from '../components/ui'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      navigate(location.state?.from || '/dashboard', { replace: true })
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <img src="/icon.svg" alt="" width={52} height={52} style={{ borderRadius: 14, marginBottom: 12 }} />
          <div style={styles.logo}>{BRAND.name}</div>
          <h1 style={styles.title}>Maker dashboard</h1>
          <p style={styles.sub}>Sign in to manage your orders</p>
        </div>
        <form style={styles.form} onSubmit={handleLogin}>
          <Field label="Email">
            <Input type="email" autoComplete="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
          </Field>
          {error && <div style={ui.error}>{error}</div>}
          <Button type="submit" block loading={loading}>{loading ? 'Signing in…' : 'Sign in →'}</Button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { background: 'var(--card)', borderRadius: 22, width: '100%', maxWidth: 400, overflow: 'hidden', boxShadow: '0 4px 24px rgba(43,34,51,0.08)' },
  header: { background: 'var(--dark)', padding: '30px 28px', textAlign: 'center' },
  logo: { fontFamily: "'Fraunces', serif", fontSize: 16, color: 'var(--primary)', fontWeight: 700, marginBottom: 8 },
  title: { fontFamily: "'Fraunces', serif", fontSize: 26, color: '#fff', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 6 },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  form: { padding: 28, display: 'flex', flexDirection: 'column', gap: 16 },
}
