# Create(L)ive(Ly) Studio — Claude Session Context

Order management + shop PWA for **Create(L)ive(Ly) Studio** (3D prints, custom gifts & keepsakes, brand merch, vendor essentials, digital papers). Her storefront today is Payhip at createlivelyinc.com; brand colors/fonts in `src/brand.js` come from that theme. Modeled on `dazzlindezigns/MakerQue-App` (DCIoS); see README.md for setup.

## Stack
- React 18 + Vite SPA, React Router v6
- Inline CSS style objects only (no Tailwind, no CSS modules). Shared pieces in `src/components/ui.jsx`.
- Theme: CSS variables `--primary --secondary --accent --plum --bg --card --card2 --dark --mid --muted --border --success --warning --danger`, set at runtime from `COLORS` in `src/brand.js`. `--accent` (#EFA2B3) is too light for text on white — use it only for gradients/decoration. Fonts: Playfair Display (headings), Montserrat (body).
- Shop products belong to a collection (`products.collection`, keys from `COLLECTIONS` in `src/brand.js`: labs, paper-studio, vendors, elevate). The shop filters via `?c=<key>` (or `?c=digital`).
- Supabase (anon key in browser; service role key only in `/api`)
- Vercel functions, ESM, `export default async function handler(req, res)`
- Stripe Checkout Sessions (form-encoded POST, `STRIPE_SECRET_KEY`; `api/_lib/stripe.js`), Resend, web-push, Anthropic SDK (`claude-opus-4-8` via `api/_lib/anthropic.js`, structured outputs via zod), Gemini image API (REST, `GEMINI_API_KEY`). No shipping-label integration — tracking is entered manually.

## Layout
- Public pages: `/` homepage (`Home.jsx`), `/custom` order form (only reached from CTAs; old `/?type=` and `/order` links still work), `/shop/products`. Public pages share `SiteHeader`/`SiteFooter` (`src/components/SiteChrome.jsx`).
- Responsive behavior uses the small class set in `src/index.css` (`container`, `grid-2`, `grid-4`, `hero-grid`, `order-grid`, `detail-cols`, `admin-sidebar`, `hide-desktop`…), because inline styles can't hold media queries. Admin pages render `<Nav>`, which adds `body.admin-layout` (desktop sidebar) and the phone bottom bar.
- The installable PWA is admin-only: `enableAdminApp()` in `src/lib/pwa.js` adds the manifest and iOS tags on `/dashboard` and `/login`. Don't put `<link rel="manifest">` back in `index.html`.

## Rules
- **Database changes go in a NEW file** `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`. Never edit a migration that already shipped. Supabase isn't connected to GitHub, so each new file must be pasted into the SQL Editor by hand: always tell the user the file's raw GitHub link and that it needs running. Keep migrations re-runnable (IF NOT EXISTS) and test them on a scratch Postgres first.
- **Brand values come from `src/brand.js`** — never hardcode the business name or hex colors. It's imported by both the app and `/api`, so keep it browser-API-free.
- **`po_number` and `internal_notes` are admin-only.** Never return them to customers. `publicOrder()` in `api/_lib/core.js` strips them; customer pages must use `/api/get-order`, never query `orders` directly.
- **Never trust client amounts.** Use `paymentOptions()` (`src/lib/money.js`) and `priceCart()` (`api/_lib/pricing.js`) server-side.
- **New API route:** add `api/_handlers/<name>.js` and register it in `api/[action].js`. Don't add top-level files in `/api` (Hobby plan has a 12-function limit). Throw `HttpError(status, msg)` for errors.
- Admin endpoints call `await requireAdmin(req)`; the browser sends the token via `api(path, { auth: true })`.
- Email HTML must escape user input with `esc()` / `escBr()` from `api/_lib/email.js`. Customer-facing emails pass `log: { orderId, kind }` to `sendEmail()` so they appear in the order's email history (`email_log` table, shown by `src/components/EmailPanel.jsx`). With `REPLY_DOMAIN` set, Reply-To becomes `order-<uuid>@REPLY_DOMAIN` so `api/resend-webhook.js` can match replies to orders; never forward into `REPLY_DOMAIN` (mail loop).
- AI calculator: `supplyLines[].qty` is the **total batch quantity** — don't multiply by `item.qty`.
- Column `stripe_payment_url` holds the latest Stripe Checkout link. Card payment is enabled per order by `'card'` in `payment_methods` (`'in_person'` is the other option). Each checkout is a `payments` row matched by `stripe_session_id`; the webhook claims the pending row once, so retries can't double-count.
- **Sticker Bar** is her sticker-sheet line (`STICKER_BAR` in `src/brand.js`, collection `sticker-bar`), not an event booking (`orders.event_details` is unused). A sheet is ONE physical product with `digital_price` + a private download file, so cart lines carry `format: 'digital'|'physical'`. Sticker sheets get Stack & Save tiers (`settings.sticker_bar_tiers`) instead of `BULK_TIERS`. Cart math is shared by the shop page and `priceCart()` through `src/lib/cart.js`, so change it there only.
- `products.stock` (null = untracked) applies to physical units only. `priceCart()` refuses oversells, and `api/stripe-webhook.js` decrements via the `decrement_product_stock` RPC when a shop order is paid in full.
- **Quote with AI** on a custom request opens `/dashboard/calculator?order=<id>`. `create-invoice` with `orderId` updates that order's quote in place (refused once payments exist). `estimate-from-description` takes `imageUrls` (public `order-files` only) and sends them to Claude as URL images.
- **AI listing photos** must start from her real product photo when one exists, and the prompt must keep the product unchanged (only restyle the scene) so listings don't misrepresent what ships.
- **Digital products** (`products.kind = 'digital'`): files go in the PRIVATE `digital-products` bucket; only `digital_file_path` is stored. Never select or return that path to customers (`get-products` omits it; `publicOrder()` strips `digitalFilePath` from `shop_cart`). Buyers get signed URLs only via `api/_handlers/get-downloads.js`, and only when paid in full. Shared logic lives in `api/_lib/downloads.js`.

## Key files
| Path | Purpose |
|------|---------|
| `supabase/migrations/*.sql` | Tables, RLS (`is_admin()`), storage buckets. **Applied by hand** in the Supabase SQL Editor (no GitHub integration connected). `20261019…` and `20261020…` have been run; `20261021000000_stripe_payments.sql` must be run before Stripe goes live; `20261022000000_sticker_bar_sheets.sql` adds the Sticker Bar product columns, settings and her six draft sheets. |
| `api/[action].js` | Router for all `/api/*` endpoints |
| `api/stripe-webhook.js` | Stripe `checkout.session.completed` → marks payments paid (signature-verified) |
| `api/resend-webhook.js` | Inbound customer replies (Resend `email.received`, signature-verified) → `email_log` (direction `in`) + forward to her inbox |
| `api/_lib/*` | db/auth, email layout, push, Stripe, Claude client, tracking links, pricing, validation |
| `src/pages/OrderDetail.jsx` | Admin order page (quote, Quote with AI, payments, proofs, shipping, PO) |
| `src/lib/cart.js` | Shared cart math: formats, Stack & Save, bulk tiers, codes, free shipping |
| `src/components/ShipModal.jsx` | Enter carrier + tracking → "shipped" email |
| `api/_handlers/send-customer-email.js` / `draft-email.js` | In-app email send / Claude polish (order page → Emails) |
| `api/_handlers/write-listing.js` / `generate-listing-image.js` | Claude listing copy / Gemini listing photos (admin product editor) |
