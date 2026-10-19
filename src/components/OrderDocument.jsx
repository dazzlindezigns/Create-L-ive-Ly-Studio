import { BRAND, QUOTE_TERMS } from '../brand'
import { fmt, paymentOptions } from '../lib/money'

// Printable quote / invoice / receipt. Hidden on screen (.print-only); the browser's
// "Save as PDF" turns it into the PDF customers and the studio download.
export default function OrderDocument({ order }) {
  const { paid, remaining, deposit } = paymentOptions(order)
  const kind = Number(order.price) > 0 && remaining <= 0 ? 'Receipt' : order.source === 'form' ? 'Quote' : 'Invoice'
  const lines = order.quote_breakdown?.lines?.length
    ? order.quote_breakdown.lines
    : [{ description: order.product_type, qty: order.quantity || 1, unitPrice: Number(order.price || 0) / (order.quantity || 1) }]
  const date = (d) => new Date(d).toLocaleDateString('en-US', { dateStyle: 'long', timeZone: BRAND.timezone })
  const addr = order.shipping_address

  return (
    <div className="print-only" style={s.page}>
      <div style={s.head}>
        <div>
          <img src={BRAND.logo} alt={BRAND.name} style={{ width: 190, height: 'auto', display: 'block' }} />
          <div style={s.small}>{BRAND.name} · {BRAND.location}</div>
          <div style={s.small}>{window.location.host}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={s.title}>{kind.toUpperCase()}</div>
          <div style={s.small}>#{order.id.slice(0, 8).toUpperCase()}</div>
          <div style={s.small}>{date(order.quote_sent_at || order.created_at)}</div>
        </div>
      </div>

      <div style={s.parties}>
        <div>
          <div style={s.label}>{kind === 'Quote' ? 'Prepared for' : 'Bill to'}</div>
          <div style={{ fontWeight: 700 }}>{order.customer_name}</div>
          <div>{order.customer_email}</div>
          {order.customer_phone && <div>{order.customer_phone}</div>}
        </div>
        {addr && order.fulfillment === 'shipping' && (
          <div>
            <div style={s.label}>Ship to</div>
            <div>{addr.name || order.customer_name}</div>
            <div>{[addr.street, addr.street2].filter(Boolean).join(', ')}</div>
            <div>{addr.city}, {addr.state} {addr.zip}</div>
          </div>
        )}
      </div>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th, textAlign: 'left' }}>Item</th>
            <th style={s.th}>Qty</th>
            <th style={s.th}>Unit</th>
            <th style={s.th}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={s.td}>{l.description}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{l.qty}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{fmt(l.unitPrice)}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{fmt(l.qty * l.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={s.totals}>
        <Row k="Total" v={fmt(order.price)} bold />
        {order.deposit_type !== 'full' && paid === 0 && deposit < Number(order.price) && <Row k="Deposit due to start" v={fmt(deposit)} />}
        {paid > 0 && <Row k="Paid" v={`−${fmt(paid)}`} />}
        <Row k={remaining > 0 ? 'Balance due' : 'Balance'} v={remaining > 0 ? fmt(remaining) : 'Paid in full'} bold />
      </div>

      {(order.turnaround || order.quote_note) && (
        <div style={{ marginTop: 18, fontSize: 13, lineHeight: 1.6 }}>
          {order.turnaround && <div><strong>Turnaround:</strong> {order.turnaround}</div>}
          {order.quote_note && <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{order.quote_note}</div>}
        </div>
      )}

      {order.source !== 'shop' && (
        <div style={{ marginTop: 22 }}>
          <div style={s.label}>Terms</div>
          <ol style={{ paddingLeft: 18, margin: '6px 0 0', fontSize: 11, color: '#555', lineHeight: 1.6 }}>
            {QUOTE_TERMS.map((t, i) => <li key={i}>{t}</li>)}
          </ol>
          <div style={{ marginTop: 12, fontSize: 12 }}>
            {order.terms_agreed_at
              ? <>Signed by <span style={{ fontFamily: "'Dancing Script', cursive", fontSize: 18 }}>{order.customer_signature}</span> on {date(order.terms_agreed_at)}</>
              : 'Review, sign and pay online at the link in your email.'}
          </div>
        </div>
      )}

      <div style={s.foot}>Thank you for supporting {BRAND.name} 💕</div>
    </div>
  )
}

const Row = ({ k, v, bold }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, padding: '4px 0', fontWeight: bold ? 800 : 400, fontSize: bold ? 15 : 13 }}>
    <span>{k}</span><span>{v}</span>
  </div>
)

const s = {
  page: { color: '#222', fontSize: 13, padding: '8px 4px' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 26 },
  title: { fontSize: 26, fontWeight: 800, letterSpacing: '0.08em' },
  small: { fontSize: 12, color: '#777', marginTop: 4 },
  parties: { display: 'flex', gap: 60, marginBottom: 22, lineHeight: 1.5 },
  label: { fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#999', marginBottom: 4 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '8px 6px', borderBottom: '2px solid #222', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' },
  td: { padding: '9px 6px', borderBottom: '1px solid #e5e5e5' },
  totals: { marginLeft: 'auto', width: 280, marginTop: 14 },
  foot: { marginTop: 36, paddingTop: 12, borderTop: '1px solid #e5e5e5', fontSize: 12, color: '#777', textAlign: 'center' },
}
