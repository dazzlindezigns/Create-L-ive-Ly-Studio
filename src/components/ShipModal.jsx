import { useState } from 'react'
import { api } from '../lib/api'
import { ui, Button, Field, Input, Select, Modal } from './ui'

const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL', 'Other']

// She buys labels outside the app (e.g. Pirate Ship, USPS.com, the post office) and
// enters the tracking number here; the customer gets a "shipped" email with a tracking link.
export default function ShipModal({ order, onClose, onDone }) {
  const known = CARRIERS.find(c => c.toLowerCase() === String(order.shipping_carrier || '').toLowerCase())
  const [carrier, setCarrier] = useState(known || (order.shipping_carrier ? 'Other' : 'USPS'))
  const [otherCarrier, setOtherCarrier] = useState(known ? '' : order.shipping_carrier || '')
  const [tracking, setTracking] = useState(order.tracking_number || '')
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const a = order.shipping_address
  const addressText = a?.street ? [a.name, a.street, a.street2, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean).join('\n') : ''

  const save = async () => {
    setBusy(true); setError('')
    try {
      await api('mark-shipped', {
        auth: true,
        body: { orderId: order.id, trackingNumber: tracking.trim(), carrier: carrier === 'Other' ? otherCarrier.trim() : carrier, notify },
      })
      onDone(notify ? 'Marked shipped — tracking emailed to customer' : 'Marked shipped')
    } catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <Modal title="Mark as shipped" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {addressText && (
          <div style={{ background: 'var(--card2)', borderRadius: 12, padding: 14 }}>
            <div style={{ ...ui.eyebrow, marginBottom: 6 }}>Ship to</div>
            <div style={{ whiteSpace: 'pre-line', fontSize: 14, lineHeight: 1.5 }}>{addressText}</div>
            <button onClick={() => navigator.clipboard.writeText(addressText)} style={styles.link}>Copy address for your label</button>
          </div>
        )}
        <div style={ui.row}>
          <Field label="Carrier"><Select value={carrier} onChange={e => setCarrier(e.target.value)} options={CARRIERS} /></Field>
          {carrier === 'Other' && <Field label="Carrier name"><Input value={otherCarrier} onChange={e => setOtherCarrier(e.target.value)} /></Field>}
        </div>
        <Field label="Tracking number"><Input value={tracking} onChange={e => setTracking(e.target.value)} autoFocus /></Field>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
          <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /> Email the customer their tracking link
        </label>
        {error && <div style={ui.error}>{error}</div>}
        <Button block loading={busy} disabled={!tracking.trim()} onClick={save}>Mark shipped</Button>
      </div>
    </Modal>
  )
}

const styles = {
  link: { background: 'none', border: 'none', color: 'var(--secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: '8px 0 0' },
}
