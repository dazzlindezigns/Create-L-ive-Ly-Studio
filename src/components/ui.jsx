import { useState, useCallback, useRef } from 'react'
import { BRAND } from '../brand'
import { STATUS } from '../lib/status'

// Shared inline-style building blocks. Pages keep their own `styles` objects for layout;
// these cover the pieces every page repeats (cards, fields, buttons, badges, toasts).

export const ui = {
  page: { minHeight: '100vh', background: 'var(--bg)', paddingBottom: 96 },
  wrap: { maxWidth: 720, margin: '0 auto', padding: '20px 16px' },
  card: {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18,
    padding: 20, boxShadow: '0 2px 14px rgba(148,82,103,0.07)',
  },
  h1: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15 },
  h2: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 12 },
  eyebrow: { fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--dark)', display: 'block', marginBottom: 6 },
  hint: { fontSize: 12, color: 'var(--muted)', marginTop: 4 },
  input: {
    width: '100%', padding: '12px 14px', border: '1.5px solid var(--border)', borderRadius: 12,
    background: '#fff', fontSize: 16, color: 'var(--dark)',
  },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  error: {
    padding: '10px 14px', background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)',
    borderRadius: 10, fontSize: 13, color: 'var(--danger)', fontWeight: 500,
  },
  divider: { height: 1, background: 'var(--border)', margin: '16px 0' },
}

const BTN = {
  base: {
    border: 'none', borderRadius: 50, padding: '13px 22px', fontSize: 15, fontWeight: 700,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    textDecoration: 'none', WebkitTapHighlightColor: 'transparent', transition: 'opacity .15s',
  },
  primary: { background: 'var(--primary)', color: '#fff' },
  secondary: { background: 'var(--secondary)', color: '#fff' },
  gradient: { background: 'linear-gradient(135deg, var(--accent), var(--primary))', color: '#fff' },
  ghost: { background: 'transparent', color: 'var(--dark)', border: '1.5px solid var(--border)' },
  danger: { background: 'rgba(220,38,38,0.08)', color: 'var(--danger)' },
  small: { padding: '8px 14px', fontSize: 13 },
}

export function Button({ variant = 'primary', small, block, loading, disabled, style, children, ...rest }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      style={{
        ...BTN.base, ...BTN[variant], ...(small ? BTN.small : {}),
        ...(block ? { width: '100%' } : {}),
        ...(disabled || loading ? { opacity: 0.55, cursor: 'default' } : {}),
        ...style,
      }}
    >
      {loading ? <Spinner size={16} color="currentColor" /> : null}
      {children}
    </button>
  )
}

export function Field({ label, hint, children, style }) {
  return (
    <label style={{ display: 'block', flex: 1, minWidth: 140, ...style }}>
      {label && <span style={ui.label}>{label}</span>}
      {children}
      {hint && <div style={ui.hint}>{hint}</div>}
    </label>
  )
}

export const Input = (p) => <input {...p} style={{ ...ui.input, ...p.style }} />
export const TextArea = (p) => <textarea rows={4} {...p} style={{ ...ui.input, resize: 'vertical', lineHeight: 1.5, ...p.style }} />
export const Select = ({ options, ...p }) => (
  <select {...p} style={{ ...ui.input, appearance: 'auto', ...p.style }}>
    {options.map(o => typeof o === 'string'
      ? <option key={o} value={o}>{o}</option>
      : <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
)

export function Badge({ status, children, color, bg }) {
  const st = STATUS[status] || { label: status, color: '#888', bg: 'rgba(0,0,0,0.06)' }
  return (
    <span style={{
      display: 'inline-block', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: bg || st.bg, color: color || st.color, whiteSpace: 'nowrap',
    }}>
      {children || st.label}
    </span>
  )
}

export function Spinner({ size = 28, color = 'var(--primary)' }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      border: `${Math.max(2, size / 9)}px solid rgba(0,0,0,0.08)`, borderTopColor: color,
      animation: 'spin .8s linear infinite',
    }} />
  )
}

export function Loading({ text = 'Loading…' }) {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <Spinner />
      <span style={ui.muted}>{text}</span>
    </div>
  )
}

// Customer-facing header with the business name.
export function BrandHeader({ subtitle }) {
  return (
    <header style={{ textAlign: 'center', padding: '28px 16px 8px' }}>
      <a href={BRAND.website} aria-label={BRAND.name}>
        <img src={BRAND.logo} alt={BRAND.name} width={210} style={{ width: 210, maxWidth: '62vw', height: 'auto', display: 'block', margin: '0 auto' }} />
      </a>
      {subtitle && <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 12 }}>{subtitle}</div>}
    </header>
  )
}

// Toast: const [toast, flash] = useFlash(); flash('Saved!'); render {toast}
export function useFlash() {
  const [msg, setMsg] = useState(null)
  const timer = useRef()
  const flash = useCallback((text, kind = 'ok') => {
    setMsg({ text, kind })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), 3200)
  }, [])
  const toast = msg ? (
    <div style={{
      position: 'fixed', left: '50%', bottom: 96, transform: 'translateX(-50%)', zIndex: 300,
      background: msg.kind === 'error' ? 'var(--danger)' : 'var(--dark)', color: '#fff',
      padding: '12px 20px', borderRadius: 50, fontSize: 14, fontWeight: 600,
      boxShadow: '0 6px 24px rgba(0,0,0,0.2)', maxWidth: 'calc(100vw - 32px)', textAlign: 'center',
    }}>{msg.text}</div>
  ) : null
  return [toast, flash]
}

export function Modal({ title, onClose, children, width = 520 }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,14,24,0.5)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 0,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--card)', width: '100%', maxWidth: width, maxHeight: '92vh', overflowY: 'auto',
        borderRadius: '22px 22px 0 0', padding: '22px 20px calc(24px + env(safe-area-inset-bottom))',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ ...ui.h2, marginBottom: 0 }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 26, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
