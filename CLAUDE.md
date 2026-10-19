# Create(L)ive(Ly) Studio — Claude Session Context

Order management + shop PWA for **Create(L)ive(Ly) Studio** (3D prints, custom gifts & keepsakes, brand merch, vendor essentials, digital papers). Her storefront today is Payhip at createlivelyinc.com; brand colors/fonts in `src/brand.js` come from that theme. Modeled on `dazzlindezigns/MakerQue-App` (DCIoS); see README.md for setup.

## Stack
- React 18 + Vite SPA, React Router v6
- Inline CSS style objects only (no Tailwind, no CSS modules). Shared pieces in `src/components/ui.jsx`.
- Theme: CSS variables `--primary --secondary --accent --plum --bg --card --card2 --dark --mid --muted --border --success --warning --danger`, set at runtime from `COLORS` in `src/brand.js`. `--accent` (#EFA2B3) is too light for text on white — use it only for gradients/decoration. Fonts: Playfair Display (headings), Montserrat (body).
- Shop products belong to a collection (`products.collection`, keys from `COLLECTIONS` in `src/brand.js`: labs, paper-studio, vendors, elevate). The shop filters via `?c=<key>` (or `?c=digital`).
- Supabase (anon key in browser; service role key only in `/api`)
- Vercel functions, ESM, `export default async function handler(req, res)`
- Square Payment Links (JSON API, Bearer `SQUARE_SECRET_KEY`), Resend, EasyPost, web-push, Anthropic SDK (`claude-opus-4-8`, structured outputs via zod)

## Rules
- **Brand values come from `src/brand.js`** — never hardcode the business name or hex colors. It's imported by both the app and `/api`, so keep it browser-API-free.
- **`po_number` and `internal_notes` are admin-only.** Never return them to customers. `publicOrder()` in `api/_lib/core.js` strips them; customer pages must use `/api/get-order`, never query `orders` directly.
- **Never trust client amounts.** Use `paymentOptions()` (`src/lib/money.js`) and `priceCart()` (`api/_lib/pricing.js`) server-side.
- **New API route:** add `api/_handlers/<name>.js` and register it in `api/[action].js`. Don't add top-level files in `/api` (Hobby plan has a 12-function limit). Throw `HttpError(status, msg)` for errors.
- Admin endpoints call `await requireAdmin(req)`; the browser sends the token via `api(path, { auth: true })`.
- Email HTML must escape user input with `esc()` / `escBr()` from `api/_lib/email.js`.
- AI calculator: `supplyLines[].qty` is the **total batch quantity** — don't multiply by `item.qty`.
- Column `stripe_payment_url` holds the latest Square link (name kept from the reference schema).
- **Digital products** (`products.kind = 'digital'`): files go in the PRIVATE `digital-products` bucket; only `digital_file_path` is stored. Never select or return that path to customers (`get-products` omits it; `publicOrder()` strips `digitalFilePath` from `shop_cart`). Buyers get signed URLs only via `api/_handlers/get-downloads.js`, and only when paid in full. Shared logic lives in `api/_lib/downloads.js`.

## Key files
| Path | Purpose |
|------|---------|
| `supabase/schema.sql` | Tables, RLS (`is_admin()`), storage buckets |
| `api/[action].js` | Router for all `/api/*` endpoints |
| `api/square-webhook.js` | Marks payments paid (signature-verified) |
| `api/_lib/*` | db/auth, email layout, push, Square, EasyPost, pricing, validation |
| `src/pages/OrderDetail.jsx` | Admin order page (quote, payments, proofs, shipping, PO) |
| `src/components/ShipModal.jsx` | EasyPost address → rates → label, or manual tracking |
