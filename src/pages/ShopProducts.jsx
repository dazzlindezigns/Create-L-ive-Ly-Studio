import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, uploadFile } from '../lib/api'
import { fmt, round2 } from '../lib/money'
import { BRAND, BULK_TIERS, COLLECTIONS, STICKER_BAR, getBulkTier } from '../brand'
import { cartTotals, normalizeTiers, tierFor, lineFormat, unitPrice, offersDigital, offersPhysical, isSticker } from '../lib/cart'
import { ui, Button, Field, Input, TextArea, Select, Loading, Modal } from '../components/ui'
import { SiteHeader, SiteFooter } from '../components/SiteChrome'

const CART_KEY = 'shop-cart-v2'
const loadCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || [] } catch { return [] } }

export default function ShopProducts() {
  const [params, setParams] = useSearchParams()
  const [products, setProducts] = useState(null)
  const [settings, setSettings] = useState({})
  const [cart, setCart] = useState(loadCart) // [{ key, productId, option, quantity, format }]
  const [cartOpen, setCartOpen] = useState(false)
  useEffect(() => {
    // If products can't load, customers still get the designed shop with "coming soon" collections.
    Promise.all([
      api('get-products').catch(e => { console.error('get-products:', e.message); return [] }),
      api('get-settings').catch(() => ({})),
    ]).then(([p, s]) => { setProducts(p); setSettings(s) })
  }, [])

  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch {} }, [cart])

  const shopOpen = settings.shop_open !== false && settings.shop_open !== 'false'
  const byId = useMemo(() => Object.fromEntries((products || []).map(p => [p.id, p])), [products])
  const lines = cart.filter(c => byId[c.productId]).map(c => {
    const product = byId[c.productId]
    const format = lineFormat(product, c.format)
    const quantity = format === 'digital' ? 1 : c.quantity
    const unit = unitPrice(product, format)
    return { ...c, format, quantity, product, unit, total: round2(unit * quantity) }
  })
  const stackTiers = normalizeTiers(settings.sticker_bar_tiers)
  const stickerCount = lines.filter(l => isSticker(l.product)).reduce((s, l) => s + l.quantity, 0)
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
    ...COLLECTIONS.map(c => ({ key: c.key, label: c.name, blurb: c.blurb })),
    ...(all.some(p => offersDigital(p)) ? [{ key: 'digital', label: '⬇️ Digital downloads' }] : []),
  ]
  const active = filters.find(f => f.key === filter) || filters[0]
  const shown = all.filter(p => active.key === 'all' || (active.key === 'digital' ? offersDigital(p) : p.collection === active.key))
  const stickerView = active.key === STICKER_BAR.collection

  // Collections bar: keep the selected tab in view when it scrolls sideways on phones.
  const barRef = useRef(null)
  useEffect(() => {
    const center = () => {
      const bar = barRef.current
      const tab = bar?.querySelector('[aria-current="true"]')
      if (!tab) return
      const barBox = bar.getBoundingClientRect(), tabBox = tab.getBoundingClientRect()
      bar.scrollLeft += tabBox.left - barBox.left - (barBox.width - tabBox.width) / 2
    }
    center()
    document.fonts?.ready.then(center) // tab widths change once the web font loads
  }, [active.key, products])
  const pickCollection = (key) => {
    setParam('c', key === 'all' ? null : key)
    // If the bar is pinned mid-scroll, jump back up so the new collection starts in view.
    const top = (barRef.current?.parentElement?.offsetTop || 0) - 80
    if (window.scrollY > top + 40) window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }

  const add = (product, option, quantity, format) => {
    const digital = format === 'digital'
    const key = `${product.id}|${digital ? '' : option || ''}|${format}`
    // Digital items are one copy per order — adding again doesn't stack.
    setCart(prev => prev.some(c => c.key === key)
      ? prev.map(c => c.key === key ? { ...c, quantity: digital ? 1 : c.quantity + quantity } : c)
      : [...prev, { key, productId: product.id, option: digital ? null : option, quantity: digital ? 1 : quantity, format }])
    setParam('p', null)
    setCartOpen(true)
  }

  if (!products) return <Loading />

  return (
    <div style={{ ...ui.page, paddingBottom: 0 }}>
      <SiteHeader />
      <div className="container" style={{ paddingTop: 28, paddingBottom: 90 }}>
        {stickerView ? (
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <img src={STICKER_BAR.logo} alt={`${BRAND.shortName} ${STICKER_BAR.name}`} style={{ width: 'min(360px, 80%)', height: 'auto' }} />
            <p style={{ ...ui.muted, maxWidth: 560, margin: '8px auto 0', lineHeight: 1.7 }}>{STICKER_BAR.intro}</p>
          </div>
        ) : (<>
        <h1 style={{ ...ui.h1, textAlign: 'center', marginBottom: 6 }}>{active.key === 'all' ? 'Shop' : active.label}</h1>
        <p style={{ ...ui.muted, textAlign: 'center', marginBottom: 18 }}>{active.blurb || BRAND.subTagline}</p>
        </>)}
        {!shopOpen && (
          <div style={{ ...ui.card, background: 'var(--card2)', textAlign: 'center', marginBottom: 16 }}>
            <strong>Shop is closed</strong>
            <div style={ui.muted}>{settings.shop_closed_message || 'Check back soon!'}</div>
          </div>
        )}
        {stickerView || (active.key === 'all' && all.some(isSticker)) ? (
          <div style={styles.bulkStrip}>
            ♡ {STICKER_BAR.name} Stack & Save — mix any sheets: {stackTiers.slice().reverse().map(t => `${t.min}+ = ${t.pct}% off`).join(' · ')}
          </div>
        ) : (
          <div style={styles.bulkStrip}>
            ♡ Bulk savings: {BULK_TIERS.slice().reverse().map(t => `${t.min}+ = ${t.badge}`).join(' · ')}
          </div>
        )}
        {Number(settings.shop_free_shipping_over) > 0 && (
          <div style={{ ...ui.hint, textAlign: 'center', marginTop: -8, marginBottom: 16 }}>📦 Free shipping on orders over {fmt(settings.shop_free_shipping_over)}</div>
        )}

        <nav aria-label="Shop collections" style={styles.filterBar}>
          <div ref={barRef} className="scroll-x" style={styles.filters}>
            {filters.map((f, i) => (
              <button key={f.key} onClick={() => pickCollection(f.key)} aria-current={active.key === f.key ? 'true' : undefined}
                style={{ ...styles.filter, ...(active.key === f.key ? styles.filterOn : {}), ...(i === 0 ? { marginLeft: 'auto' } : {}), ...(i === filters.length - 1 ? { marginRight: 'auto' } : {}) }}>{f.label}</button>
            ))}
          </div>
        </nav>
        {shown.length === 0 ? (
          active.key === 'all' || active.key === 'digital'
            ? <ComingSoonCollections onPick={key => setParam('c', key)} />
            : <ComingSoon collection={COLLECTIONS.find(c => c.key === active.key)} onBrowse={() => setParam('c', null)} />
        ) : (
          <>
          <div style={styles.grid}>
            {shown.map(p => {
              const both = offersPhysical(p) && offersDigital(p)
              const soldOut = p.kind !== 'digital' && p.stock != null && p.stock <= 0
              const tag = soldOut ? (both ? 'Vinyl sold out' : 'Sold out') : p.badge || (p.kind === 'digital' ? 'Digital' : both ? 'Digital + vinyl' : null)
              return (
              <button key={p.id} onClick={() => setParam('p', p.id)} style={styles.tile}>
                <div style={{ ...styles.imgWrap, position: 'relative' }}>
                  {p.image_urls?.[0] ? <img src={p.image_urls[0]} alt={p.name} style={{ ...styles.img, ...(isSticker(p) ? { objectFit: 'contain' } : {}) }} /> : <div style={styles.noImg}>{p.kind === 'digital' ? '⬇️' : '✨'}</div>}
                  {tag && <span style={{ ...styles.digitalTag, ...(soldOut ? { background: 'var(--dark)' } : {}) }}>{tag}</span>}
                </div>
                <div style={{ padding: '10px 12px 14px', textAlign: 'left' }}>
                  {p.series && <div style={styles.series}>{p.series} collection</div>}
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontWeight: 800, color: 'var(--primary)', marginTop: 2 }}>
                    {both ? `from ${fmt(Math.min(p.price, p.digital_price))}` : fmt(p.price)}
                  </div>
                </div>
              </button>
              )
            })}
          </div>
          </>
        )}
        <p style={{ ...ui.muted, textAlign: 'center', marginTop: 24 }}>
          Need something custom? <Link to="/custom">Request a custom item</Link>
        </p>
      </div>
      <SiteFooter />

      {count > 0 && !cartOpen && (
        <button onClick={() => setCartOpen(true)} style={styles.cartBar}>
          <span>🛒 {count} item{count === 1 ? '' : 's'}</span>
          <span>View cart · {fmt(lines.reduce((s, l) => s + l.total, 0))}</span>
        </button>
      )}

      {selected && <ProductModal product={selected} cartQty={count} stickerCount={stickerCount} stackTiers={stackTiers} settings={settings}
        onClose={() => setParam('p', null)} onAdd={add} disabled={!shopOpen} />}
      {cartOpen && <CartModal lines={lines} settings={settings} stackTiers={stackTiers} shopOpen={shopOpen} onClose={() => setCartOpen(false)}
        setQty={(key, q) => setCart(prev => q <= 0 ? prev.filter(c => c.key !== key) : prev.map(c => c.key === key ? { ...c, quantity: q } : c))}
        onCheckedOut={() => setCart([])} />}
    </div>
  )
}

// Shown while a collection has no products yet (or the shop couldn't load them).
function ComingSoonCollections({ onPick }) {
  return (
    <>
      <p style={{ ...ui.muted, textAlign: 'center', marginBottom: 18 }}>New pieces are on the way — here’s what’s coming to the shop.</p>
      <div className="grid-2">
        {COLLECTIONS.map(c => (
          <button key={c.key} onClick={() => onPick(c.key)} style={{ ...styles.tile, textAlign: 'left' }}>
            <div style={{ aspectRatio: '2 / 1', overflow: 'hidden', background: 'var(--card2)', position: 'relative' }}>
              <img src={c.image} alt={`${BRAND.name} ${c.name}`} loading="lazy" style={styles.img} />
              <span style={styles.digitalTag}>Coming soon</span>
            </div>
            <div style={{ padding: '14px 16px 18px' }}>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 600 }}>{c.name}</div>
              <div style={{ ...ui.muted, marginTop: 4, lineHeight: 1.6 }}>{c.blurb}</div>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

function ComingSoon({ collection, onBrowse }) {
  if (!collection) return null
  const sticker = collection.key === STICKER_BAR.collection
  return (
    <div style={{ ...ui.card, padding: 0, overflow: 'hidden' }}>
      {sticker ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(30%, 150px), 1fr))', gap: 10, padding: 14, background: 'var(--card2)' }}>
          {STICKER_BAR.showcase.map(src => <img key={src} src={src} alt="Sticker Bar sticker sheet" loading="lazy" style={{ width: '100%', aspectRatio: '2 / 3', objectFit: 'cover', borderRadius: 12, display: 'block' }} />)}
        </div>
      ) : (
        <img src={collection.image} alt={`${BRAND.name} ${collection.name}`} style={{ width: '100%', aspectRatio: '2 / 1', maxHeight: 420, objectFit: 'cover', display: 'block' }} />
      )}
      <div style={{ padding: '22px 22px 26px', textAlign: 'center' }}>
        <div style={{ ...ui.eyebrow, marginBottom: 6 }}>{sticker ? 'First drop coming soon' : 'Coming soon'}</div>
        <p style={{ color: 'var(--mid)', lineHeight: 1.8, maxWidth: 620, margin: '0 auto' }}>{collection.description}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 }}>
          <Link to="/custom" style={styles.ctaPink}>Request a custom item</Link>
          <button onClick={onBrowse} style={styles.ctaGhost}>Browse all collections</button>
        </div>
      </div>
    </div>
  )
}

function ProductModal({ product, cartQty, stickerCount, stackTiers, settings, onClose, onAdd, disabled }) {
  const both = offersPhysical(product) && offersDigital(product)
  const soldOut = product.kind !== 'digital' && product.stock != null && product.stock <= 0
  const [format, setFormat] = useState(product.kind === 'digital' || (both && soldOut) ? 'digital' : 'physical')
  const [option, setOption] = useState(product.options?.[0] || null)
  const [qty, setQty] = useState(1)
  const [imgIdx, setImgIdx] = useState(0)
  const isDigital = format === 'digital'
  const sticker = isSticker(product)
  const price = unitPrice(product, format)
  const maxQty = product.stock != null ? Math.max(0, product.stock) : 10000
  const unavailable = !isDigital && soldOut
  const nextTier = getBulkTier(cartQty + qty)
  const nextStack = tierFor(stackTiers, stickerCount + (isDigital ? 1 : qty))
  const shipNote = Number(settings.shop_free_shipping_over) > 0 ? ` Free shipping over ${fmt(settings.shop_free_shipping_over)}.` : ''
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
      {product.series && <div style={{ ...styles.series, marginTop: 12 }}>{product.series} collection</div>}
      <div style={{ fontWeight: 800, fontSize: 22, color: 'var(--primary)', margin: '6px 0 6px' }}>{fmt(price)}</div>
      {product.description && <p style={{ whiteSpace: 'pre-wrap', color: 'var(--mid)', fontSize: 14, lineHeight: 1.6 }}>{product.description}</p>}

      {both && (
        <>
          <div style={{ ...ui.label, marginTop: 14 }}>Choose your format</div>
          <div style={styles.formats}>
            {[
              ['digital', '⬇️', 'Digital', product.digital_price, 'Instant download'],
              ['physical', '📦', sticker ? 'Vinyl sheet' : 'Physical', product.price, soldOut ? 'Sold out' : 'Shipped or picked up'],
            ].map(([k, icon, label, amount, sub]) => (
              <button key={k} type="button" onClick={() => setFormat(k)} disabled={k === 'physical' && soldOut}
                style={{ ...styles.formatBtn, ...(format === k ? styles.formatOn : {}), ...(k === 'physical' && soldOut ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <span style={{ fontWeight: 700 }}>{label}</span>
                <span style={{ fontWeight: 800, color: 'var(--primary)' }}>{fmt(amount)}</span>
                <span style={ui.hint}>{sub}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {isDigital ? (
        <div style={styles.digitalNote}>
          ⬇️ <strong>Instant digital download</strong>
          {product.digital_file_name && <> · {product.digital_file_name.split('.').pop().toUpperCase()} file</>}
          <div style={{ ...ui.hint, marginTop: 4 }}>Your download link is emailed as soon as payment goes through. Nothing is shipped.</div>
        </div>
      ) : (
      <>
      {both && <div style={{ ...ui.hint, marginTop: 8 }}>{sticker ? 'Premium waterproof vinyl, packed flat so nothing bends.' : 'A finished piece, made and packed by hand.'}{shipNote}</div>}
      <div style={{ ...ui.row, marginTop: 14 }}>
        {product.options?.length > 0 && (
          <Field label="Option"><Select value={option} onChange={e => setOption(e.target.value)} options={product.options} /></Field>
        )}
        <Field label="Quantity" hint={product.stock != null && product.stock > 0 && product.stock <= 10 ? `Only ${product.stock} left` : null}>
          <Input type="number" min={1} max={maxQty} value={qty} onChange={e => setQty(Math.max(1, Math.min(maxQty || 1, parseInt(e.target.value, 10) || 1)))} />
        </Field>
      </div>
      </>
      )}

      {product.bulk_pricing_enabled !== false && (sticker ? (
        <div style={styles.bulkTable}>
          {stackTiers.slice().reverse().map(t => {
            const hit = nextStack?.min === t.min
            return (
              <div key={t.min} style={{ ...styles.bulkRow, ...(hit ? { background: 'rgba(22,163,74,0.08)', fontWeight: 700 } : {}) }}>
                <span>{t.min}+ sheets</span><span style={{ color: hit ? 'var(--success)' : 'var(--muted)' }}>{t.pct}% off</span>
              </div>
            )
          })}
          <div style={{ ...ui.hint, padding: '6px 12px' }}>Stack & Save: mix any sheets and formats — the discount applies automatically.</div>
        </div>
      ) : !isDigital && (
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
      ))}
      <Button block disabled={disabled || unavailable} onClick={() => onAdd(product, option, qty, format)} style={{ marginTop: 14 }}>
        {disabled ? 'Shop is closed' : unavailable ? 'Sold out' : `Add to cart · ${fmt(price * (isDigital ? 1 : qty))}`}
      </Button>
    </Modal>
  )
}

function CartModal({ lines, settings, stackTiers, shopOpen, onClose, setQty, onCheckedOut }) {
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
  const hasPhysical = lines.some(l => l.format === 'physical')
  const hasDigital = lines.some(l => l.format === 'digital')
  const fee = Number(settings.shop_shipping_fee) || 0
  const freeOver = Number(settings.shop_free_shipping_over) || 0
  const t = cartTotals(
    lines.map(l => ({ itemTotal: l.total, quantity: l.quantity, bulkEligible: l.product.bulk_pricing_enabled !== false, sticker: isSticker(l.product) })),
    {
      stackTiers,
      code: discount && { discount_type: discount.type, discount_value: discount.value },
      shippingFee: hasPhysical && f.fulfillment === 'shipping' ? fee : 0,
      freeShippingOver: freeOver,
    },
  )
  const { subtotal, stackTier, stackDiscount, tier, bulkDiscount, codeDiscount, shipping, total } = t
  const afterBulk = round2(subtotal - stackDiscount - bulkDiscount)
  const toFreeShipping = hasPhysical && fee > 0 && freeOver > 0 ? round2(freeOver - t.merchandise) : 0

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
          items: lines.map(l => ({ productId: l.productId, option: l.option, quantity: l.quantity, format: l.format })),
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
      {stackTier && <Line k={`Stack & Save (${stackTier.pct}% off sheets)`} v={`−${fmt(stackDiscount)}`} green />}
      {tier && <Line k={`Bulk discount (${tier.badge})`} v={`−${fmt(bulkDiscount)}`} green />}
      {discount && <Line k={`Code ${discount.code}`} v={`−${fmt(codeDiscount)}`} green />}
      {shipping > 0 && <Line k="Shipping" v={fmt(shipping)} />}
      {t.freeShipping && <Line k="Shipping" v="Free 🎉" green />}
      {toFreeShipping > 0 && <div style={{ ...ui.hint, padding: '3px 0' }}>Add {fmt(toFreeShipping)} more for free shipping</div>}
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
                <div style={ui.muted}>{l.format === 'digital' ? 'Digital download' : `${isSticker(l.product) && offersDigital(l.product) ? 'Vinyl sheet · ' : ''}${l.option ? `${l.option} · ` : ''}${fmt(l.unit)} each`}</div>
              </div>
              {l.format === 'digital' ? (
                <button onClick={() => setQty(l.key, 0)} style={{ ...styles.qtyBtn, width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 600 }}>Remove</button>
              ) : (
              <div style={styles.qty}>
                <button onClick={() => setQty(l.key, l.quantity - 1)} style={styles.qtyBtn}>−</button>
                <span style={{ minWidth: 26, textAlign: 'center', fontWeight: 700 }}>{l.quantity}</span>
                <button onClick={() => setQty(l.key, l.quantity + 1)} disabled={l.product.stock != null && l.quantity >= l.product.stock} style={styles.qtyBtn}>+</button>
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
              { value: 'shipping', label: `Ship to me${fee ? (t.freeShipping ? ' (free!)' : ` (+${fmt(fee)})`) : ''}` },
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
          <Button type="submit" block loading={busy} disabled={uploading}>Pay {fmt(total)} securely →</Button>
          <Button type="button" variant="ghost" block onClick={() => setStep('cart')}>← Back to cart</Button>
        </form>
      )}
    </Modal>
  )
}

const Line = ({ k, v, green }) => <div style={{ ...styles.line, color: green ? 'var(--success)' : undefined }}><span>{k}</span><span>{v}</span></div>

const styles = {
  bulkStrip: { textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--secondary)', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 50, padding: '8px 14px', marginBottom: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(46%, 220px), 1fr))', gap: 14 },
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
  // Pinned just under the 68px site header while scrolling the shop.
  filterBar: { position: 'sticky', top: 68, zIndex: 90, margin: '0 -20px 16px', padding: '10px 20px', background: 'rgba(255,250,249,0.94)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)' },
  // Centered via auto margins on the end tabs (justify-content: center clips overflowing tabs).
  filters: { display: 'flex', gap: 8, overflowX: 'auto', flexWrap: 'nowrap' },
  filter: { flexShrink: 0, whiteSpace: 'nowrap', padding: '8px 14px', borderRadius: 50, border: '1.5px solid var(--border)', background: 'var(--card)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--mid)' },
  filterOn: { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' },
  digitalTag: { position: 'absolute', top: 8, left: 8, background: 'var(--primary)', color: '#fff', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '3px 8px', borderRadius: 20 },
  ctaPink: { display: 'inline-flex', alignItems: 'center', background: 'linear-gradient(135deg, var(--accent), var(--primary))', color: '#fff', padding: '12px 18px', borderRadius: 13, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none' },
  ctaGhost: { font: 'inherit', display: 'inline-flex', alignItems: 'center', background: '#fff', color: 'var(--dark)', border: '1px solid var(--border)', padding: '12px 18px', borderRadius: 13, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' },
  series: { fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 2 },
  formats: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  formatBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '12px 8px', borderRadius: 14, border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', font: 'inherit', color: 'var(--dark)' },
  formatOn: { borderColor: 'var(--primary)', background: 'var(--card2)', boxShadow: '0 0 0 2px var(--primary) inset' },
  digitalNote: { background: 'var(--card2)', borderRadius: 12, padding: '12px 14px', fontSize: 14, marginTop: 12 },
  qtyBtn: { width: 28, height: 28, borderRadius: '50%', border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1 },
  line: { display: 'flex', justifyContent: 'space-between', padding: '3px 0' },
}
