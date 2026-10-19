// ─────────────────────────────────────────────────────────────────────────────
// BRAND CONFIG — the single place to rebrand the app.
// Imported by the React app AND by the /api serverless functions (emails,
// shipping labels, push notifications), so keep it plain JS with no browser APIs.
//
// TODO(brand): replace every [BRACKETED] value and the placeholder hex codes
// with the real business name, location, and brand colors.
// Two static files also carry the theme color/name: index.html and public/manifest.json.
// ─────────────────────────────────────────────────────────────────────────────

export const BRAND = {
  name: '[HER BUSINESS NAME]',
  shortName: '[HER BUSINESS NAME]',
  tagline: 'Custom stickers, labels & sticker bar experiences',
  ownerFirstName: '[OWNER FIRST NAME]',
  location: '[CITY, STATE]',
  timezone: 'America/Chicago', // TODO(brand): her IANA time zone, used for timestamps in emails
  pickupLabel: 'Local pickup ([CITY, STATE])',
  instagram: '', // e.g. 'https://instagram.com/yourhandle'
}

// Placeholder palette — swap in her real hex codes.
// `primary` replaces the reference app's pink (#FF66C4), `secondary` replaces its blue (#38b6ff).
export const COLORS = {
  primary: '#FF4F8B',     // TODO(brand): main brand color — buttons, highlights
  secondary: '#14B8A6',   // TODO(brand): second brand color — links, info states
  accent: '#7C5CFF',      // TODO(brand): third accent — gradients, badges
  bg: '#FFF8F3',          // page background
  card: '#FFFFFF',        // card / panel background
  card2: '#FFF1E8',       // subtle inset background
  dark: '#2B2233',        // primary text
  mid: 'rgba(43,34,51,0.72)',
  muted: 'rgba(43,34,51,0.45)',
  border: 'rgba(43,34,51,0.10)',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
}

export const FONTS = {
  body: "'Plus Jakarta Sans', sans-serif",
  heading: "'Fraunces', serif",
  script: "'Dancing Script', cursive",
}

// Order form options — edit freely, they are plain labels stored on the order.
export const PRODUCT_TYPES = [
  'Die-cut stickers',
  'Kiss-cut stickers',
  'Sticker sheets',
  'Clear / holographic stickers',
  'Vinyl decals',
  'Product labels',
  'Sticker bar event',
  'Other',
]

export const STICKER_SIZES = ['2" × 2"', '3" × 3"', '4" × 4"', '5" × 5"', 'Custom size']
export const FINISHES = ['Matte', 'Glossy', 'Holographic', 'Clear', 'Glitter', 'Not sure yet']

// Shop bulk pricing — applied to the cart quantity of bulk-eligible products.
export const BULK_TIERS = [
  { min: 100, pct: 25, label: '100+ items',  badge: '25% off' },
  { min: 50,  pct: 15, label: '50–99 items', badge: '15% off' },
  { min: 25,  pct: 10, label: '25–49 items', badge: '10% off' },
  { min: 10,  pct: 5,  label: '10–24 items', badge: '5% off' },
]

export function getBulkTier(qty) {
  return BULK_TIERS.find(t => qty >= t.min) || null
}

export const QUOTE_TERMS = [
  'Your order goes into production once the deposit (or full payment) is received.',
  'Digital proofs are sent before printing. Production starts only after you approve the proof.',
  'Two rounds of proof revisions are included. Additional revisions or design changes may add cost.',
  'Because every order is custom, deposits are non-refundable once design work has started.',
  'Turnaround times start after proof approval. Rush requests are not guaranteed unless confirmed in writing.',
  'Colors can vary slightly between screens and printed materials.',
  'You confirm you own or have permission to use any artwork, logos, or images you submit.',
]
