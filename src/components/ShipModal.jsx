import { useState } from 'react'
import { api } from '../lib/api'
import { fmt } from '../lib/money'
import { ui, Button, Field, Input, Modal, Spinner } from './ui'

// Parses the legacy "Ship to street, city, ST zip" line from notes when shipping_address is empty.
function addressFromOrder(order) {
  if (order.shipping_address?.street) return order.shipping_address
  const m = (order.notes || '').match(/Ship to ([^,]+),\s*([^,]+),\s*([A-Z]{2})\s+(\d[\d-]+)/i)
  return m ? { street: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip: m[4] } : {}
}

// 3 steps: address → rates → purchased label. "Enter tracking manually" skips EasyPost.
export default function ShipModal({ order, onClose, onDone }) {
  const a = addressFromOrder(order)
  const [step, setStep] = useState('address')
  const [addr, setAddr] = useState({
    name: a.name || order.customer_name, street1: a.street || '', street2: a.street2 || '',
    city: a.city || '', state: a.state || '', zip: a.zip || '',
  })
  const [parcel, setParcel] = useState({ weight: 16, length: 8, width: 6, height: 4 })
  const [rates, setRates] = useState([])
  const [shipmentId, setShipmentId] = useState(null)
  const [label, setLabel] = useState(null)
  const [manual, setManual] = useState({ tracking: order.tracking_number || '', carrier: order.shipping_carrier || 'USPS' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const setA = (k) => (e) => setAddr(p => ({ ...p, [k]: k === 'state' ? e.target.value.toUpperCase() : e.target.value }))
  const setP = (k) => (e) => setParcel(p => ({ ...p, [k]: e.target.value }))

  const run = async (fn) => {
    setBusy(true); setError('')
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const getRates = () => run(async () => {
    const r = await api('easypost-rates', {
      auth: true,
      body: { to_address: { ...addr, phone: order.customer_phone || undefined, email: order.customer_email }, parcel },
    })
    setRates(r.rates); setShipmentId(r.shipment_id); setStep('rates')
  })

  const buy = (rate) => run(async () => {
    const r = await api('easypost-buy', { auth: true, body: { orderId: order.id, shipment_id: shipmentId, rate_id: rate.id } })
    setLabel(r); setStep('label')
  })

  const markShipped = (tracking, carrier) => run(async () => {
    await api('mark-shipped', { auth: true, body: { orderId: order.id, trackingNumber: tracking, carrier, notify: true } })
    onDone('Marked shipped — tracking emailed to customer')
  })

  return (
    <Modal title="Ship order" onClose={onClose}>
      {step === 'address' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={ui.eyebrow}>Ship to</div>
          <Field label="Name"><Input value={addr.name} onChange={setA('name')} /></Field>
          <Field label="Street"><Input value={addr.street1} onChange={setA('street1')} /></Field>
          <Field label="Apt / suite"><Input value={addr.street2} onChange={setA('street2')} /></Field>
          <div style={ui.row}>
            <Field label="City" style={{ flex: 2 }}><Input value={addr.city} onChange={setA('city')} /></Field>
            <Field label="State" style={{ minWidth: 70 }}><Input maxLength={2} value={addr.state} onChange={setA('state')} /></Field>
            <Field label="ZIP" style={{ minWidth: 90 }}><Input value={addr.zip} onChange={setA('zip')} /></Field>
          </div>
          <div style={ui.eyebrow}>Package</div>
          <div style={ui.row}>
            <Field label="Weight (oz)"><Input type="number" step="0.1" value={parcel.weight} onChange={setP('weight')} /></Field>
            <Field label="L (in)"><Input type="number" step="0.1" value={parcel.length} onChange={setP('length')} /></Field>
            <Field label="W (in)"><Input type="number" step="0.1" value={parcel.width} onChange={setP('width')} /></Field>
            <Field label="H (in)"><Input type="number" step="0.1" value={parcel.height} onChange={setP('height')} /></Field>
          </div>
          {error && <div style={ui.error}>{error}</div>}
          <Button block loading={busy} onClick={getRates}>Get rates →</Button>
          <button onClick={() => setStep('manual')} style={styles.link}>Enter tracking number manually instead</button>
        </div>
      )}

      {step === 'rates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rates.length === 0 && <div style={ui.muted}>No rates returned for this address/package.</div>}
          {rates.map(r => (
            <button key={r.id} onClick={() => buy(r)} disabled={busy} style={styles.rate}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700 }}>{r.carrier} {r.service}</div>
                <div style={ui.muted}>{r.est_delivery_days ? `~${r.est_delivery_days} day${r.est_delivery_days > 1 ? 's' : ''}` : 'Delivery estimate unavailable'}</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{fmt(r.rate)}</div>
            </button>
          ))}
          {busy && <div style={{ textAlign: 'center', padding: 8 }}><Spinner size={20} /> <span style={ui.muted}>Buying label…</span></div>}
          {error && <div style={ui.error}>{error}</div>}
          <button onClick={() => setStep('address')} style={styles.link}>← Back</button>
        </div>
      )}

      {step === 'label' && label && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...ui.card, background: 'var(--card2)' }}>
            <div style={{ fontWeight: 700 }}>Label purchased ✓</div>
            <div style={ui.muted}>{label.carrier} {label.service} · {fmt(label.rate)}</div>
            <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 15 }}>{label.tracking_number}</div>
          </div>
          {label.label_url && <a href={label.label_url} target="_blank" rel="noreferrer"><Button block variant="secondary">Print label ↗</Button></a>}
          {error && <div style={ui.error}>{error}</div>}
          <Button block loading={busy} onClick={() => markShipped(label.tracking_number, `${label.carrier} ${label.service}`)}>Mark shipped & email tracking</Button>
        </div>
      )}

      {step === 'manual' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Carrier"><Input value={manual.carrier} onChange={e => setManual(m => ({ ...m, carrier: e.target.value }))} /></Field>
          <Field label="Tracking number"><Input value={manual.tracking} onChange={e => setManual(m => ({ ...m, tracking: e.target.value }))} /></Field>
          {error && <div style={ui.error}>{error}</div>}
          <Button block loading={busy} disabled={!manual.tracking.trim()} onClick={() => markShipped(manual.tracking.trim(), manual.carrier.trim())}>
            Mark shipped & email tracking
          </Button>
          <button onClick={() => setStep('address')} style={styles.link}>← Buy a label with EasyPost instead</button>
        </div>
      )}
    </Modal>
  )
}

const styles = {
  link: { background: 'none', border: 'none', color: 'var(--secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 6 },
  rate: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 16px',
    borderRadius: 14, border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', font: 'inherit', color: 'inherit',
  },
}
