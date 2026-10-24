import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fmt } from '../lib/money'
import { BRAND } from '../brand'
import { ui, Loading } from '../components/ui'
import { useShop, ProductDetail, CartModal } from './ShopProducts'

// /p/:id — one product on its own page, for links she shares (texts, Instagram, Facebook).
// Customers can add it and check out right here; the rest of the shop is one tap away.
export default function ProductPage() {
  const { id } = useParams()
  const { products, settings, byId, lines, shopOpen, stackTiers, stackCount, count, addToCart, setQty, clearCart } = useShop()
  const [cartOpen, setCartOpen] = useState(false)
  const product = byId[id]

  useEffect(() => {
    if (product) document.title = `${product.name} · ${BRAND.name}`
  }, [product])

  if (!products) return <Loading />

  return (
    <div style={{ ...ui.page, paddingBottom: 100 }}>
      <header style={styles.header}>
        <Link to="/" aria-label={`${BRAND.name} home`}><img src={BRAND.logo} alt={BRAND.name} style={{ height: 44, width: 'auto', display: 'block' }} /></Link>
        <Link to="/shop/products" style={styles.shopLink}>Browse the shop →</Link>
      </header>

      <main style={{ ...ui.wrap, maxWidth: 560 }}>
        {!product ? (
          <div style={{ ...ui.card, textAlign: 'center', padding: 32 }}>
            <h1 style={{ ...ui.h2, marginBottom: 6 }}>This item isn’t available right now</h1>
            <p style={ui.muted}>It may be sold out or no longer listed.</p>
            <Link to="/shop/products" style={{ display: 'inline-block', marginTop: 14, fontWeight: 700 }}>See what’s in the shop →</Link>
          </div>
        ) : (
          <div style={ui.card}>
            <h1 style={{ ...ui.h1, fontSize: 26, marginBottom: 12 }}>{product.name}</h1>
            {!shopOpen && (
              <div style={{ ...ui.card, background: 'var(--card2)', textAlign: 'center', marginBottom: 12 }}>
                <strong>Shop is closed</strong>
                <div style={ui.muted}>{settings.shop_closed_message || 'Check back soon!'}</div>
              </div>
            )}
            <ProductDetail product={product} stackCount={stackCount} stackTiers={stackTiers} settings={settings}
              disabled={!shopOpen} cartCount={count} onViewCart={() => setCartOpen(true)}
              onAdd={(...args) => { if (!addToCart(...args)) setCartOpen(true) }} />
          </div>
        )}
        <p style={{ ...ui.muted, textAlign: 'center', marginTop: 20 }}>
          {BRAND.name} · {BRAND.location} · <Link to="/custom">Request a custom item</Link>
        </p>
      </main>

      {count > 0 && !cartOpen && (
        <button onClick={() => setCartOpen(true)} style={styles.cartBar}>
          <span>🛒 {count} item{count === 1 ? '' : 's'}</span>
          <span>View cart · {fmt(lines.reduce((s, l) => s + l.total, 0))}</span>
        </button>
      )}
      {cartOpen && <CartModal lines={lines} settings={settings} stackTiers={stackTiers} shopOpen={shopOpen}
        onClose={() => setCartOpen(false)} setQty={setQty} onCheckedOut={clearCart} returnTo={`/p/${id}`} />}
    </div>
  )
}

const styles = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 20px', maxWidth: 600, margin: '0 auto' },
  shopLink: { fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--primary)', textDecoration: 'none' },
  cartBar: {
    position: 'fixed', left: 16, right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom))', maxWidth: 560, margin: '0 auto',
    display: 'flex', justifyContent: 'space-between', padding: '16px 22px', borderRadius: 50, border: 'none',
    background: 'var(--dark)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 8px 30px rgba(0,0,0,0.25)', zIndex: 50,
  },
}
