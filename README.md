# [HER BUSINESS NAME] — Order Management PWA

Custom order + shop management for a sticker / label / sticker bar business. Modeled on the MakerQue (DCIoS) app.

**Customer side:** custom order form (`/`), quote review with e-sign + Square payment (`/quote/:id`), proof approval (`/proof/:id`), shop with cart, bulk discounts and discount codes (`/shop/products`) selling both physical products and digital downloads, and a downloads page for paid digital orders (`/downloads/:id`).

**Admin side** (login required): dashboard with status pipeline, live updates, shop open/closed toggle and push notifications (`/dashboard`), full order management with proofs, payments, EasyPost labels and admin-only PO numbers (`/dashboard/order/:id`), AI price calculator + invoices (`/dashboard/calculator`), products, discount codes and shop settings (`/dashboard/products`).

## Stack
React 18 + Vite · React Router v6 · inline style objects + CSS variables · Supabase · Vercel serverless functions · Square Payment Links · Resend · EasyPost · web-push · Anthropic API (`claude-opus-4-8`)

## Rebrand first
Everything brand-related lives in **`src/brand.js`**: name, location, time zone, colors, product types, bulk tiers, quote terms. Also update the two static files: `public/manifest.json` (name + `theme_color`) and `public/icon.svg` (then regenerate the PNG icons from it).

## Setup

1. **Supabase**
   - Create a project. In SQL Editor run `supabase/schema.sql`.
   - Authentication → Users → add the owner's login, then:
     ```sql
     insert into admin_users (user_id, email)
     select id, email from auth.users where email = 'owner@example.com';
     ```
2. **Square** (Developer Dashboard)
   - Copy the access token → `SQUARE_SECRET_KEY`, the location ID → `SQUARE_LOCATION_ID`. Start with `SQUARE_ENVIRONMENT=sandbox`.
   - Webhooks → add `https://<domain>/api/square-webhook` for `payment.created` and `payment.updated`; copy the signature key → `SQUARE_WEBHOOK_SIGNATURE_KEY`.
3. **Resend**: verify the sending domain, set `RESEND_API_KEY` and `EMAIL_FROM`.
4. **EasyPost**: `EASYPOST_API_KEY` + the `MAKER_*` return address.
5. **Push**: `npx web-push generate-vapid-keys` → `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT=mailto:...`.
6. **Anthropic**: `ANTHROPIC_API_KEY` for the calculator's AI estimate.
7. Add every variable from `.env.example` to Vercel → Settings → Environment Variables, then deploy.

On iPhone, push notifications only work after "Add to Home Screen" (iOS 16.4+).

## Local development
```bash
npm install
cp .env.example .env.local   # fill in
npx vercel dev               # runs the Vite app AND /api functions
```
`npm run dev` alone serves the UI only — the `/api` routes need `vercel dev`.

## How it fits together
- **Security:** the browser only has the anon key, and RLS gives anonymous users no table access. Customer pages read orders through `/api/get-order`, which strips admin-only fields (`po_number`, `internal_notes`, label URL, internal cost breakdown). Admin pages query Supabase directly; RLS allows it only for users in `admin_users`. Admin API routes verify the Supabase session token.
- **Money is computed server-side.** Shop totals, bulk discounts, discount codes and deposit/balance amounts are recalculated from the database before a Square link is created.
- **One function for all routes.** `api/[action].js` dispatches to `api/_handlers/*.js`, so the whole API counts as 2 functions on Vercel's Hobby plan (limit 12). `api/square-webhook.js` is separate because it needs the raw request body.
- **Payments:** each Square checkout is recorded in `payments`; the webhook matches it by Square order ID, updates `amount_paid`, and moves the order to `confirmed`. Cash/Zelle/etc. can be recorded manually on the order page.

## Digital products
- In **Shop → + Digital**, add a name, price and preview images, then upload the file buyers will receive (PDF, ZIP, PNG, SVG, cut files, Procreate, fonts, etc., up to 50 MB; zip multiple files together).
- Files live in the **private** `digital-products` storage bucket. The browser never sees the storage path.
- Physical and digital items can share one cart. Download-only carts skip delivery and shipping. Digital items are one copy per order and don't count toward bulk discounts unless she ticks that box.
- When Square confirms full payment, the webhook emails the buyer a link to `/downloads/:orderId`, and download-only orders are marked **Complete**. Each visit to that page creates fresh links that expire after 24 hours, so the emailed link keeps working while shared file links don't.
- If someone pays another way, record the payment on the order, then tap **Email download link**.

## Order statuses
`pending → quote_sent → confirmed → proof_sent ⇄ revisions_requested → proof_approved → in_production → ready_for_pickup | shipped → completed` (plus `invoice_sent`, `payment_pending` for shop checkouts, `declined`, `cancelled`).
