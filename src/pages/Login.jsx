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
          <img src={BRAND.logo} alt={BRAND.name} width={200} style={{ width: 200, maxWidth: '70%', height: 'auto', display: 'block', margin: '0 auto 14px' }} />
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
  card: { background: 'var(--card)', borderRadius: 22, width: '100%', maxWidth: 400, overflow: 'hidden', boxShadow: '0 4px 24px rgba(148,82,103,0.10)' },
  header: { background: 'var(--card2)', padding: '28px 28px 24px', textAlign: 'center', borderBottom: '1px solid var(--border)' },
  title: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 24, color: 'var(--dark)', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 6 },
  sub: { fontSize: 13, color: 'var(--muted)' },
  form: { padding: 28, display: 'flex', flexDirection: 'column', gap: 16 },
}
