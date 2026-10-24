// Star rating. Read-only by default; pass onChange to make the stars tappable.
export default function Stars({ value = 0, size = 16, onChange, label }) {
  const filled = Math.round(value)
  return (
    <span role={onChange ? 'radiogroup' : 'img'} aria-label={label || `${value} out of 5 stars`} style={{ display: 'inline-flex', gap: onChange ? 4 : 1, lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map(n => onChange ? (
        <button key={n} type="button" role="radio" aria-checked={filled === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)}
          style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', fontSize: size, color: n <= filled ? 'var(--star)' : 'var(--starOff)', lineHeight: 1 }}>★</button>
      ) : (
        <span key={n} style={{ fontSize: size, color: n <= filled ? 'var(--star)' : 'var(--starOff)' }}>★</span>
      ))}
    </span>
  )
}
