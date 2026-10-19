# Create(L)ive(Ly) Studio — Orders & Shop PWA

Custom orders, shop and studio management for Create(L)ive(Ly) Studio — 3D prints (Labs), digital papers (Paper Studio), vendor essentials (Vendors) and empowering merch (Elevate). Modeled on the MakerQue (DCIoS) app.

**Customer side:** custom order form (`/`), quote review with e-sign + Square payment (`/quote/:id`), proof approval (`/proof/:id`), shop with cart, bulk discounts and discount codes (`/shop/products`) selling both physical products and digital downloads, and a downloads page for paid digital orders (`/downloads/:id`).

**Admin side** (login required): dashboard with status pipeline, live updates, shop open/closed toggle and push notifications (`/dashboard`), full order management with proofs, payments, shipping/tracking emails and admin-only PO numbers (`/dashboard/order/:id`), AI price calculator + invoices (`/dashboard/calculator`), products with a Claude listing writer and Gemini photo generator, discount codes and shop settings (`/dashboard/products`).

## Stack
React 18 + Vite · React Router v6 · inline style objects + CSS variables · Supabase · Vercel serverless functions · Square Payment Links · Resend · web-push · Anthropic API (`claude-opus-4-8`) · Google Gemini image API

## Branding
Everything brand-related lives in **`src/brand.js`**: name, colors and fonts (taken from her Payhip theme), collections, custom-order product types, bulk tiers and quote terms. Still to fill in there: `ownerFirstName`, `location`, `pickupLabel` and `timezone`. Static brand files: `public/manifest.json`, `public/logo.png` (her transparent logo) and the icons/OG image generated from it.

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
4. **Shipping**: no integration. She buys labels wherever she likes (Pirate Ship, USPS.com, the post office), then taps **Mark shipped** on the order and enters the carrier and tracking number. The customer gets a tracking email.
5. **Push**: `npx web-push generate-vapid-keys` → `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT=mailto:...`.
6. **Anthropic**: `ANTHROPIC_API_KEY` for the calculator's AI estimate and the listing writer.
7. **Gemini**: `GEMINI_API_KEY` from Google AI Studio (turn on billing; image generation isn't on the free tier) for listing photos.
8. Add every variable from `.env.example` to Vercel → Settings → Environment Variables, then deploy.

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

## Sticker Bar bookings
The custom order form includes **Sticker Bar (event booking)**. Choosing it swaps the product fields for event fields: date, start time, length, guest count, event type, venue and address. These are saved in `orders.event_details`, the guest count goes in `quantity`, and the event date goes in `need_by`. Booking requests get their own email subject and push notification, and they skip pickup/shipping. Link straight to the booking form with `/?type=sticker-bar`.

## Digital products
- In **Shop → + Digital**, add a name, price and preview images, then upload the file buyers will receive (PDF, ZIP, PNG, SVG, cut files, Procreate, fonts, etc., up to 50 MB; zip multiple files together).
- Files live in the **private** `digital-products` storage bucket. The browser never sees the storage path.
- Physical and digital items can share one cart. Download-only carts skip delivery and shipping. Digital items are one copy per order and don't count toward bulk discounts unless she ticks that box.
- When Square confirms full payment, the webhook emails the buyer a link to `/downloads/:orderId`, and download-only orders are marked **Complete**. Each visit to that page creates fresh links that expire after 24 hours, so the emailed link keeps working while shared file links don't.
- If someone pays another way, record the payment on the order, then tap **Email download link**.

## In-app email
Every order page has an **Emails** section:
- **History:** every email this customer got about the order, both automatic (request received, quote, proof, shipped, receipt, downloads) and hand-written, with failed sends flagged.
- **Write email:** start from a template (order update, ready for pickup, running behind, quote follow-up, need more details, thank you) or type freely. Choose a link button (order page, proof, or downloads), then send. It goes out in the branded layout from `EMAIL_FROM`.
- **✨ Polish with Claude:** turns rough notes into a finished email in her voice. It keeps her details, never invents dates or prices, and leaves `[blanks]` she still needs to fill. The app warns her before sending if a blank is left.
- Customer replies go to `MAKER_EMAIL` (her normal inbox). Templates live in `EMAIL_TEMPLATES` in `src/brand.js`.

## AI listing helpers (Shop → product editor)
- **✨ Write with Claude:** she jots a few notes ("3D printed name keychain, PLA silk, 5 colors"). Claude reads the notes plus the product photos and fills in the title, description and options in the studio's voice, suggests a price, and lists anything a buyer would still need (like exact size). It's told never to invent specs. Everything stays editable before she saves. Code: `api/_handlers/write-listing.js`.
- **🎨 Create listing photos with Gemini:** pick one of her real photos and a style (clean studio, lifestyle, flat lay, gift-ready, vendor table, print mockup). Gemini keeps the product as-is and restyles the scene. Each tap makes 2 options; she adds the ones she likes. Without a photo it can generate from the description, but that won't show the exact item, so the app warns her. Code: `api/_handlers/generate-listing-image.js`.

## Order statuses
`pending → quote_sent → confirmed → proof_sent ⇄ revisions_requested → proof_approved → in_production → ready_for_pickup | shipped → completed` (plus `invoice_sent`, `payment_pending` for shop checkouts, `declined`, `cancelled`).
