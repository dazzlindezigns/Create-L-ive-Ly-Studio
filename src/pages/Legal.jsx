import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BRAND, REFUND_POLICY, PARTNER_PROGRAM } from '../brand'
import { REF_DAYS } from '../lib/affiliates'
import { SiteHeader, SiteFooter } from '../components/SiteChrome'
import { ui } from '../components/ui'

// /privacy and /terms. Plain-language policies built from the brand settings, so names,
// the refund policy and partner details stay in sync with how the app actually works.
const contact = BRAND.contactEmail
  ? <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>
  : 'reply to any email we’ve sent you'

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>{BRAND.name} (“we”, “us”) is a small studio in {BRAND.location}. This page explains what information we collect when you shop with us or request a custom order, and what we do with it. The short version: we use your information to make and deliver your order, and we never sell it.</p>

      <h2 style={s.h2}>What we collect</h2>
      <ul style={s.list}>
        <li><strong>Contact details</strong> — your name, email and (if you give it) phone number.</li>
        <li><strong>Delivery details</strong> — your shipping address when you choose shipping.</li>
        <li><strong>Order details</strong> — what you ordered, custom request descriptions, files or photos you upload, proof approvals and your signature on quotes.</li>
        <li><strong>Payment details</strong> — payments are processed by Stripe. We see that you paid and the last details Stripe shares with us, but <strong>we never see or store your full card number</strong>.</li>
        <li><strong>Reviews and feedback</strong> — star ratings and comments you choose to leave. Product reviews are shown in our shop with the name you choose; shopping-experience feedback is private to us.</li>
        <li><strong>Messages</strong> — emails you send us about an order.</li>
      </ul>

      <h2 style={s.h2}>How we use it</h2>
      <ul style={s.list}>
        <li>To make, ship or hand off your order, and to send order emails (receipts, quotes, proofs, shipping and pickup updates, download links).</li>
        <li>To ask once if you’d like to leave a review after your order is complete.</li>
        <li>To answer your questions and keep records for taxes and accounting.</li>
        <li>For custom requests, we may use a pricing assistant service to help prepare an estimate from your request details and photos. A person (us) reviews every quote before it’s sent.</li>
      </ul>
      <p>We don’t send marketing newsletters from this site, and we don’t use advertising or tracking cookies.</p>

      <h2 style={s.h2}>Things saved in your browser</h2>
      <p>Your browser remembers your cart, and — if you arrived through a {PARTNER_PROGRAM.short} partner’s link — that partner’s code for {REF_DAYS} days so they can be credited for your purchase. Partners see their sales totals but <strong>never your name or details</strong>. You can clear these anytime by clearing your browser’s site data.</p>

      <h2 style={s.h2}>Who we share it with</h2>
      <p>Only the services that help us run the shop, and only what they need:</p>
      <ul style={s.list}>
        <li><strong>Stripe</strong> — card payments and refunds.</li>
        <li><strong>Supabase</strong> — secure storage for orders and uploaded files.</li>
        <li><strong>Vercel</strong> — hosts this website.</li>
        <li><strong>Resend</strong> — sends our emails.</li>
        <li><strong>A pricing assistant service</strong> — may help us estimate custom quotes from your request details.</li>
        <li><strong>Shipping carriers</strong> (like USPS or UPS) — your name and address on the label.</li>
      </ul>
      <p>We share information if the law requires it. We <strong>never sell or rent</strong> your personal information.</p>

      <h2 style={s.h2}>How long we keep it</h2>
      <p>We keep order records as long as we need them for your order, customer service and our tax records (usually several years). You can ask us to delete your information sooner, unless we have to keep it by law.</p>

      <h2 style={s.h2}>Your choices</h2>
      <p>You can ask to see, correct or delete your information, or ask us to remove a review you left — just {BRAND.contactEmail ? <>email {contact}</> : contact}. This site isn’t meant for children under 13, and we don’t knowingly collect their information.</p>

      <h2 style={s.h2}>Changes</h2>
      <p>If we change this policy, we’ll update it here with a new date.</p>
    </LegalShell>
  )
}

export function TermsPage() {
  return (
    <LegalShell title="Terms & Conditions">
      <p>These terms apply when you shop at or order from {BRAND.name}. By placing an order, requesting a custom item or joining {PARTNER_PROGRAM.name}, you agree to them.</p>

      <h2 style={s.h2}>Orders and pricing</h2>
      <p>Prices are in US dollars. Your order is confirmed once payment goes through. If a price or listing is wrong, or we can’t fill an order, we’ll let you know and refund anything you paid. Discount codes and Stack & Save savings apply as shown at checkout and can’t be combined unless the cart shows them together.</p>

      <h2 style={s.h2}>Shop items</h2>
      <p>Shop items are made exactly as shown — we can’t add names, colors or other changes to shop orders. Handmade and printed pieces can vary slightly from photos and between screens; that’s part of their charm. For something personalized, <Link to="/custom">request a custom order</Link>.</p>

      <h2 style={s.h2}>Custom orders</h2>
      <p>Custom work starts with a quote. When you sign and pay the quote (or its deposit), you agree to the terms listed on it, including proof approvals, revision rounds and turnaround. Production starts after you approve your proof, and you confirm you have the right to use any artwork, logos or images you send us.</p>

      <h2 style={s.h2}>Shipping and pickup</h2>
      <p>Shipping times start after your order is made. We send tracking when it’s available. Please double-check your address — we aren’t responsible for packages sent to an address you entered incorrectly. Pickup orders are held for you once we let you know they’re ready; we’ll work out a time together.</p>

      <h2 style={s.h2}>Refunds</h2>
      <ul style={s.list}>
        <li><strong>{REFUND_POLICY.digital}</strong></li>
        <li><strong>{REFUND_POLICY.custom}</strong></li>
        <li>{REFUND_POLICY.physical} If something arrives damaged or isn’t what you ordered, contact us within 7 days of delivery or pickup with a photo and we’ll make it right.</li>
        <li>Approved refunds go back to your original payment method. Card refunds usually take 5–10 business days to appear.</li>
      </ul>

      <h2 style={s.h2}>Digital downloads</h2>
      <p>Digital products are for your own personal use unless the listing says otherwise. Please don’t resell, share or redistribute the files. Your download link is for you; keep it private.</p>

      <h2 style={s.h2}>Reviews</h2>
      <p>Reviews come only from verified buyers. Please keep them honest and kind — we may hide reviews that are off-topic, offensive or share private information.</p>

      <h2 style={s.h2} id="partners">{PARTNER_PROGRAM.name} (partner program)</h2>
      <ul style={s.list}>
        <li>Partners are invited by us. You earn the commission shown on your partner page on shop purchases made through your links within {REF_DAYS} days of someone tapping one.</li>
        <li>Commission is figured on items after discounts, not shipping. It’s earned once the order is complete; refunded or cancelled orders don’t earn, and partial refunds lower it.</li>
        <li>Your own purchases get your partner discount instead of commission.</li>
        <li>Be honest: tell people you may earn from your links, don’t spam, and don’t make claims about our products we haven’t made. We may pause or end a partnership at any time, and we’ll pay any earned commission when we do.</li>
        <li>You’re responsible for any taxes on what you earn.</li>
      </ul>

      <h2 style={s.h2}>Our designs</h2>
      <p>Our designs, photos and product listings belong to {BRAND.name}. Please don’t copy or sell them.</p>

      <h2 style={s.h2}>Limits</h2>
      <p>We do our best with every order. To the extent the law allows, our responsibility for any order is limited to the amount you paid for it.</p>

      <h2 style={s.h2}>The legal bits</h2>
      <p>These terms are governed by the laws of the State of {BRAND.legalState}. We may update them; changes apply to orders placed after the new date above. Questions? {BRAND.contactEmail ? <>Email {contact}.</> : <>Just {contact}.</>} See also our <Link to="/privacy">Privacy Policy</Link>.</p>
    </LegalShell>
  )
}

function LegalShell({ title, children }) {
  useEffect(() => { document.title = `${title} · ${BRAND.name}`; window.scrollTo(0, 0) }, [title])
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <SiteHeader />
      <main className="container" style={{ maxWidth: 760, padding: '28px 20px 10px' }}>
        <div style={ui.eyebrow}>{BRAND.name}</div>
        <h1 style={{ ...ui.h1, marginTop: 4 }}>{title}</h1>
        <p style={{ ...ui.muted, marginTop: 6 }}>Last updated {BRAND.legalUpdated}</p>
        <div style={s.body}>{children}</div>
      </main>
      <SiteFooter />
    </div>
  )
}

const s = {
  body: { marginTop: 18, fontSize: 15, lineHeight: 1.7, color: 'var(--mid)', display: 'flex', flexDirection: 'column', gap: 12 },
  h2: { ...ui.h2, fontSize: 19, marginTop: 14, marginBottom: 0, color: 'var(--dark)' },
  list: { paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 },
}
