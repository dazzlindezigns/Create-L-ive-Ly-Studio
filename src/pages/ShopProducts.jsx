import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, uploadFile } from '../lib/api'
import { fmt, round2 } from '../lib/money'
import { BRAND, BULK_TIERS, COLLECTIONS, getBulkTier } from '../brand'
import { ui, Button, Field, Input, TextArea, Select, Loading, BrandHeader, Modal } from '../components/ui'

const CART_KEY = 'shop-cart-v1'
const loadCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || [] } catch { return [] } }

export default function ShopProducts() {
  const [params, setParams] = useSearchParams()
  const [products, setProducts] = useState(null)
  const [settings, setSettings] = useState({})
  const [cart, setCart] = useState(loadCart) // [{ key, productId, option, quantity }]
  const [cartOpen, setCartOpen] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api('get-products'), api('get-settings').catch(() => ({}))])
      .then(([p, s]) => { setProducts(p); setSettings(s) })
      .catch(e => setError(e.message))
  }, [])

  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch {} }, [cart])

  const shopOpen = settings.shop_open !== false && settings.shop_open !== 'false'
  const byId = useMemo(() => Object.fromEntries((products || []).map(p => [p.id, p])), [products])
  const lines = cart.filter(c => byId[c.productId]).map(c => {
    const product = byId[c.productId]
    const quantity = product.kind === 'digital' ? 1 : c.quantity
    return { ...c, quantity, product, total: round2(product.price * quantity) }
  })
  const count = lines.reduce((s, l) => s + l.quantity, 0)
  const selected = params.get('p') ? byId[params.get('p')] : null
  // Filters live in the URL (?c=labs, ?c=digital) so collection links can be shared like her Payhip ones.
  const filter = params.get('c') || 'all'
  const setParam = (key, value) => setParams(prev => {
    const next = new URLSearchParams(prev)
    if (value) next.set(key, value); else next.delete(key)
    return next
  })
  const all = products || []
  const filters = [
    { key: 'all', label: 'All products' },
    ...COLLECTIONS.filter(c => all.some(p => p.collection === c.key)).map(c => ({ key: c.key, label: c.name, blurb: c.blurb })),
    ...(all.some(p => p.kind === 'digital') ? [{ key: 'digital', label: '⬇️ Digital downloads' }] : []),
  ]
  const active = filters.find(f => f.key === filter) || filters[0]
  const shown = all.filter(p => active.key === 'all' || (active.key === 'digital' ? p.kind === 'digital' : p.collection === active.key))

  const add = (product, option, quantity) => {
    const digital = product.kind === 'digital'
    const key = `${product.id}|${option || ''}`
    // Digital items are one copy per order — adding again doesn't stack.
    setCart(prev => prev.some(c => c.key === key)
      ? prev.map(c => c.key === key ? { ...c, quantity: digital ? 1 : c.quantity + quantity } : c)
      : [...prev, { key, productId: product.id, option: digital ? null : option, quantity: digital ? 1 : quantity }])
    setParam('p', null)
    setCartOpen(true)
  }

  if (error) return <div style={ui.wrap}><div style={ui.error}>{error}</div></div>
  if (!products) return <Loading />

  return (
    <div style={{ ...ui.page, paddingBottom: 110 }}>
      <BrandHeader subtitle={BRAND.subTagline} />
      <div style={{ ...ui.wrap, maxWidth: 960 }}>
        {!shopOpen && (
          <div style={{ ...ui.card, background: 'var(--card2)', textAlign: 'center', marginBottom: 16 }}>
            <strong>Shop is closed</strong>
            <div style={ui.muted}>{settings.shop_closed_message || 'Check back soon!'}</div>
          </div>
        )}
        <div style={styles.bulkStrip}>
          ♡ Bulk savings: {BULK_TIERS.slice().reverse().map(t => `${t.min}+ = ${t.badge}`).join(' · ')}
        </div>

        {products.length === 0 ? (
          <div style={{ ...ui.card, textAlign: 'center', color: 'var(--muted)' }}>No products yet — check back soon!</div>
        ) : (
          <>
          {filters.length > 1 && (
            <div style={styles.filters}>
              {filters.map(f => (
                <button key={f.key} onClick={() => setParam('c', f.key === 'all' ? null : f.key)} style={{ ...styles.filter, ...(active.key === f.key ? styles.filterOn : {}) }}>{f.label}</button>
              ))}
            </div>
          )}
          {active.blurb && <p style={{ ...ui.muted, textAlign: 'center', margin: '-4px 0 14px' }}>{active.blurb}</p>}
          <div style={styles.grid}>
            {shown.map(p => (
              <button key={p.id} onClick={() => setParam('p', p.id)} style={styles.tile}>
                <div style={{ ...styles.imgWrap, position: 'relative' }}>
                  {p.image_urls?.[0] ? <img src={p.image_urls[0]} alt={p.name} style={styles.img} /> : <div style={styles.noImg}>{p.kind === 'digital' ? '⬇️' : '✨'}</div>}
                  {p.kind === 'digital' && <span style={styles.digitalTag}>Digital</span>}
                </div>
                <div style={{ padding: '10px 12px 14px', textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontWeight: 800, color: 'var(--primary)', marginTop: 2 }}>{fmt(p.price)}</div>
                </div>
              </button>
            ))}
          </div>
          </>
        )}
        <p style={{ ...ui.muted, textAlign: 'center', marginTop: 24 }}>
          Need something custom? <Link to="/">Request a custom order</Link>
        </p>
      </div>

      {count > 0 && !cartOpen && (
        <button onClick={() => setCartOpen(true)} style={styles.cartBar}>
          <span>🛒 {count} item{count === 1 ? '' : 's'}</span>
          <span>View cart · {fmt(lines.reduce((s, l) => s + l.total, 0))}</span>
        </button>
      )}

      {selected && <ProductModal product={selected} cartQty={count} onClose={() => setParam('p', null)} onAdd={add} disabled={!shopOpen} />}
      {cartOpen && <CartModal lines={lines} settings={settings} shopOpen={shopOpen} onClose={() => setCartOpen(false)}
        setQty={(key, q) => setCart(prev => q <= 0 ? prev.filter(c => c.key !== key) : prev.map(c => c.key === key ? { ...c, quantity: q } : c))}
        onCheckedOut={() => setCart([])} />}
    </div>
  )
}

function ProductModal({ product, cartQty, onClose, onAdd, disabled }) {
  const [option, setOption] = useState(product.options?.[0] || null)
  const [qty, setQty] = useState(1)
  const [imgIdx, setImgIdx] = useState(0)
  const isDigital = product.kind === 'digital'
  const nextTier = getBulkTier(cartQty + qty)
  return (
    <Modal title={product.name} onClose={onClose}>
      {product.image_urls?.length > 0 && (
        <>
          <img src={product.image_urls[imgIdx]} alt="" style={{ width: '100%', borderRadius: 14, background: 'var(--card2)', aspectRatio: '1', objectFit: 'contain' }} />
          {product.image_urls.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }} className="scroll-x">
              {product.image_urls.map((u, i) => (
                <img key={u} src={u} alt="" onClick={() => setImgIdx(i)} style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: i === imgIdx ? '2px solid var(--primary)' : '2px solid transparent' }} />
              ))}
            </div>
          )}
        </>
      )}
      <div style={{ fontWeight: 800, fontSize: 22, color: 'var(--primary)', margin: '12px 0 6px' }}>{fmt(product.price)}</div>
      {product.description && <p style={{ whiteSpace: 'pre-wrap', color: 'var(--mid)', fontSize: 14, lineHeight: 1.6 }}>{product.description}</p>}
      {isDigital ? (
        <div style={styles.digitalNote}>
          ⬇️ <strong>Instant digital download</strong>
          {product.digital_file_name && <> · {product.digital_file_name.split('.').pop().toUpperCase()} file</>}
          <div style={{ ...ui.hint, marginTop: 4 }}>Your download link is emailed as soon as payment goes through. Nothing is shipped.</div>
        </div>
      ) : (
      <div style={{ ...ui.row, marginTop: 14 }}>
        {product.options?.length > 0 && (
          <Field label="Option"><Select value={option} onChange={e => setOption(e.target.value)} options={product.options} /></Field>
        )}
        <Field label="Quantity"><Input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))} /></Field>
      </div>
      )}
      {!isDigital && product.bulk_pricing_enabled !== false && (
        <div style={styles.bulkTable}>
          {BULK_TIERS.slice().reverse().map(t => {
            const hit = nextTier?.min === t.min
            return (
              <div key={t.min} style={{ ...styles.bulkRow, ...(hit ? { background: 'rgba(22,163,74,0.08)', fontWeight: 700 } : {}) }}>
                <span>{t.label}</span><span style={{ color: hit ? 'var(--success)' : 'var(--muted)' }}>{t.badge}</span>
              </div>
            )
          })}
          <div style={{ ...ui.hint, padding: '6px 12px' }}>Bulk discounts count all eligible items in your cart.</div>
        </div>
      )}
      <Button block disabled={disabled} onClick={() => onAdd(product, option, qty)} style={{ marginTop: 14 }}>
        {disabled ? 'Shop is closed' : `Add to cart · ${fmt(product.price * (isDigital ? 1 : qty))}`}
      </Button>
    </Modal>
  )
}

function CartModal({ lines, settings, shopOpen, onClose, setQty, onCheckedOut }) {
  const [step, setStep] = useState('cart')
  const [code, setCode] = useState('')
  const [discount, setDiscount] = useState(null)
  const [codeMsg, setCodeMsg] = useState('')
  const [f, setF] = useState({ name: '', email: '', phone: '', fulfillment: 'pickup', street: '', street2: '', city: '', state: '', zip: '', notes: '' })
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }))

  // Display math mirrors api/_lib/pricing.js; the server recalculates before charging.
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0))
  const bulkLines = lines.filter(l => l.product.bulk_pricing_enabled !== false)
  const tier = getBulkTier(bulkLines.reduce((s, l) => s + l.quantity, 0))
  const bulkDiscount = tier ? round2(bulkLines.reduce((s, l) => s + l.total, 0) * tier.pct / 100) : 0
  const afterBulk = subtotal - bulkDiscount
  const codeDiscount = discount ? round2(discount.type === 'percent' ? afterBulk * discount.value / 100 : Math.min(discount.value, afterBulk)) : 0
  const hasPhysical = lines.some(l => l.product.kind !== 'digital')
  const hasDigital = lines.some(l => l.product.kind === 'digital')
  const shipping = hasPhysical && f.fulfillment === 'shipping' ? Number(settings.shop_shipping_fee) || 0 : 0
  const total = Math.max(0, round2(afterBulk - codeDiscount + shipping))

  const applyCode = async () => {
    setCodeMsg('')
    const r = await api('validate-discount', { body: { code, subtotal: afterBulk } }).catch(e => ({ valid: false, error: e.message }))
    if (r.valid) { setDiscount(r); setCodeMsg(`${r.code} applied`) } else { setDiscount(null); setCodeMsg(r.error) }
  }

  const onFiles = async (e) => {
    const picked = [...e.target.files].map(file => ({ file, id: `${Date.now()}-${Math.random()}` }))
    e.target.value = ''
    setFiles(prev => [...prev, ...picked.map(p => ({ id: p.id, name: p.file.name, url: null }))])
    setUploading(true)
    for (const { file, id } of picked) {
      try {
        const url = await uploadFile(file, 'order-files')
        setFiles(prev => prev.map(x => x.id === id ? { ...x, url } : x))
      } catch (err) {
        setError(err.message)
        setFiles(prev => prev.filter(x => x.id !== id))
      }
    }
    setUploading(false)
  }

  const checkout = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const { url } = await api('create-shop-order', {
        body: {
          items: lines.map(l => ({ productId: l.productId, option: l.option, quantity: l.quantity })),
          discountCode: discount?.code || null,
          customerName: f.name, customerEmail: f.email, customerPhone: f.phone, notes: f.notes,
          fulfillment: hasPhysical ? f.fulfillment : 'digital',
          shippingAddress: { street: f.street, street2: f.street2, city: f.city, state: f.state, zip: f.zip },
          designFiles: files.filter(x => x.url).map(x => x.url),
        },
      })
      onCheckedOut()
      window.location.href = url
    } catch (err) { setError(err.message); setBusy(false) }
  }

  const totals = (
    <div style={{ background: 'var(--card2)', borderRadius: 14, padding: 14, marginTop: 12, fontSize: 14 }}>
      <Line k="Subtotal" v={fmt(subtotal)} />
      {tier && <Line k={`Bulk discount (${tier.badge})`} v={`−${fmt(bulkDiscount)}`} green />}
      {discount && <Line k={`Code ${discount.code}`} v={`−${fmt(codeDiscount)}`} green />}
      {shipping > 0 && <Line k="Shipping" v={fmt(shipping)} />}
      <div style={{ ...styles.line, fontWeight: 800, fontSize: 17, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}><span>Total</span><span>{fmt(total)}</span></div>
    </div>
  )

  return (
    <Modal title={step === 'cart' ? 'Your cart' : 'Checkout'} onClose={onClose}>
      {step === 'cart' ? (
        <>
          {lines.length === 0 && <p style={ui.muted}>Your cart is empty.</p>}
          {lines.map(l => (
            <div key={l.key} style={styles.cartLine}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{l.product.name}</div>
                <div style={ui.muted}>{l.product.kind === 'digital' ? 'Digital download' : `${l.option ? `${l.option} · ` : ''}${fmt(l.product.price)} each`}</div>
              </div>
              {l.product.kind === 'digital' ? (
                <button onClick={() => setQty(l.key, 0)} style={{ ...styles.qtyBtn, width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 600 }}>Remove</button>
              ) : (
              <div style={styles.qty}>
                <button onClick={() => setQty(l.key, l.quantity - 1)} style={styles.qtyBtn}>−</button>
                <span style={{ minWidth: 26, textAlign: 'center', fontWeight: 700 }}>{l.quantity}</span>
                <button onClick={() => setQty(l.key, l.quantity + 1)} style={styles.qtyBtn}>+</button>
              </div>
              )}
              <div style={{ width: 70, textAlign: 'right', fontWeight: 700 }}>{fmt(l.total)}</div>
            </div>
          ))}
          {lines.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <Input placeholder="Discount code" value={code} onChange={e => setCode(e.target.value)} style={{ flex: 1 }} />
                <Button variant="ghost" small onClick={applyCode} disabled={!code.trim()}>Apply</Button>
              </div>
              {codeMsg && <div style={{ ...ui.hint, color: discount ? 'var(--success)' : 'var(--danger)' }}>{codeMsg}</div>}
              {totals}
              <Button block disabled={!shopOpen} onClick={() => setStep('checkout')} style={{ marginTop: 14 }}>
                {shopOpen ? 'Checkout →' : 'Shop is closed'}
              </Button>
            </>
          )}
        </>
      ) : (
        <form onSubmit={checkout} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Full name"><Input autoComplete="name" value={f.name} onChange={set('name')} required /></Field>
          <div style={ui.row}>
            <Field label="Email"><Input type="email" autoComplete="email" value={f.email} onChange={set('email')} required /></Field>
            <Field label="Phone (optional)"><Input type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></Field>
          </div>
          {hasDigital && (
            <div style={styles.digitalNote}>⬇️ Download links for your digital items are emailed to <strong>{f.email || 'you'}</strong> right after payment.</div>
          )}
          {hasPhysical && (
          <Field label={hasDigital ? 'Delivery for physical items' : 'Delivery'}>
            <Select value={f.fulfillment} onChange={set('fulfillment')} options={[
              { value: 'pickup', label: BRAND.pickupLabel },
              { value: 'shipping', label: `Ship to me${Number(settings.shop_shipping_fee) ? ` (+${fmt(settings.shop_shipping_fee)})` : ''}` },
            ]} />
          </Field>
          )}
          {hasPhysical && f.fulfillment === 'shipping' && (
            <>
              <Field label="Street"><Input autoComplete="address-line1" value={f.street} onChange={set('street')} required /></Field>
              <Field label="Apt / suite (optional)"><Input autoComplete="address-line2" value={f.street2} onChange={set('street2')} /></Field>
              <div style={ui.row}>
                <Field label="City" style={{ flex: 2 }}><Input autoComplete="address-level2" value={f.city} onChange={set('city')} required /></Field>
                <Field label="State" style={{ minWidth: 70 }}><Input maxLength={2} value={f.state} onChange={e => setF(p => ({ ...p, state: e.target.value.toUpperCase() }))} required /></Field>
                <Field label="ZIP" style={{ minWidth: 90 }}><Input inputMode="numeric" pattern="\d{5}(-\d{4})?" value={f.zip} onChange={set('zip')} required /></Field>
              </div>
            </>
          )}
          <Field label="Notes (optional)"><TextArea rows={2} value={f.notes} onChange={set('notes')} /></Field>
          {hasPhysical && (
          <label style={{ ...ui.hint, cursor: 'pointer', color: 'var(--secondary)', fontWeight: 600 }}>
            <input type="file" multiple accept="image/*,.pdf,.svg,.ai,.eps,.psd,.zip" onChange={onFiles} style={{ display: 'none' }} />
            {uploading ? 'Uploading…' : '+ Attach a design file (optional)'}
          </label>
          )}
          {files.length > 0 && <div style={ui.hint}>{files.map(x => `${x.name}${x.url ? ' ✓' : '…'}`).join(' · ')}</div>}
          {totals}
          {error && <div style={ui.error}>{error}</div>}
          <Button type="submit" block loading={busy} disabled={uploading}>Pay {fmt(total)} with Square →</Button>
          <Button type="button" variant="ghost" block onClick={() => setStep('cart')}>← Back to cart</Button>
        </form>
      )}
    </Modal>
  )
}

const Line = ({ k, v, green }) => <div style={{ ...styles.line, color: green ? 'var(--success)' : undefined }}><span>{k}</span><span>{v}</span></div>

const styles = {
  bulkStrip: { textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--secondary)', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 50, padding: '8px 14px', marginBottom: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 },
  tile: { display: 'flex', flexDirection: 'column', alignItems: 'stretch', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' },
  imgWrap: { aspectRatio: '1', background: 'var(--card2)' },
  img: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  noImg: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 },
  cartBar: {
    position: 'fixed', left: 16, right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom))', maxWidth: 560, margin: '0 auto',
    display: 'flex', justifyContent: 'space-between', padding: '16px 22px', borderRadius: 50, border: 'none',
    background: 'var(--dark)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 8px 30px rgba(0,0,0,0.25)', zIndex: 50,
  },
  bulkTable: { border: '1px solid var(--border)', borderRadius: 12, marginTop: 14, overflow: 'hidden', fontSize: 13 },
  bulkRow: { display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid var(--border)' },
  cartLine: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' },
  qty: { display: 'flex', alignItems: 'center', gap: 4 },
  filters: { display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 14 },
  filter: { padding: '8px 14px', borderRadius: 50, border: '1.5px solid var(--border)', background: 'var(--card)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--mid)' },
  filterOn: { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' },
  digitalTag: { position: 'absolute', top: 8, left: 8, background: 'var(--primary)', color: '#fff', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '3px 8px', borderRadius: 20 },
  digitalNote: { background: 'var(--card2)', borderRadius: 12, padding: '12px 14px', fontSize: 14, marginTop: 12 },
  qtyBtn: { width: 28, height: 28, borderRadius: '50%', border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1 },
  line: { display: 'flex', justifyContent: 'space-between', padding: '3px 0' },
}
