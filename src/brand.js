// ─────────────────────────────────────────────────────────────────────────────
// BRAND CONFIG — the single place to rebrand the app.
// Imported by the React app AND by the /api serverless functions (emails,
// shipping labels, push notifications), so keep it plain JS with no browser APIs.
//
// Colors and fonts come from her Payhip storefront theme (createlivelyinc.com).
// Two static files also carry the name/theme color: public/manifest.json and the
// icons in public/ (generated from public/logo.png).
// ─────────────────────────────────────────────────────────────────────────────

export const BRAND = {
  name: 'Create(L)ive(Ly) Studio',
  shortName: 'Create(L)ive(Ly)',
  tagline: 'Custom creations made with purpose',
  subTagline: 'Brand Merch • Custom Gifts • Keepsakes • And More',
  website: 'https://createlivelyinc.com',
  logo: '/logo.png',
  ownerFirstName: '[OWNER FIRST NAME]', // TODO(brand): used to sign proof notes ("Note from …")
  location: '[CITY, STATE]',            // TODO(brand)
  timezone: 'America/Chicago',          // TODO(brand): her IANA time zone, used for timestamps in emails
  pickupLabel: 'Local pickup ([CITY, STATE])', // TODO(brand)
  instagram: '',
}

// From her Payhip theme: --pink-dark #c96e88, --pink #efa2b3, --ink #352c30,
// --muted #786c71, --bg #fffaf9, --bg2 #fff1f3, --stroke rgba(201,110,136,.20).
export const COLORS = {
  primary: '#C96E88',     // her pink-dark — buttons, links, highlights (white text passes on it)
  secondary: '#A94F6B',   // her hover rose — secondary buttons and info states
  accent: '#EFA2B3',      // her signature pink — gradients and decoration only (too light for text)
  plum: '#8C6A8F',        // supporting status color
  bg: '#FFFAF9',          // page background
  card: '#FFFFFF',        // card / panel background
  card2: '#FFF1F3',       // soft pink inset background
  dark: '#352C30',        // ink — primary text
  mid: 'rgba(53,44,48,0.78)',
  muted: '#786C71',
  border: 'rgba(201,110,136,0.20)',
  success: '#2F9E62',
  warning: '#C7802B',
  danger: '#C8414B',
}

export const FONTS = {
  body: "'Montserrat', Arial, sans-serif",
  heading: "'Playfair Display', Georgia, serif",
  script: "'Dancing Script', cursive",
}

// Her storefront collections. Shop products are tagged with one of these keys.
export const COLLECTIONS = [
  { key: 'labs', name: 'Labs', blurb: '3D printed creations, specialty pieces & personalized accessories' },
  { key: 'paper-studio', name: 'Paper Studio', blurb: 'Digital papers, seamless patterns & downloadable designs' },
  { key: 'vendors', name: 'Vendors', blurb: 'Branded essentials, business accessories & display pieces' },
  { key: 'elevate', name: 'Elevate', blurb: 'Empowering apparel, inspirational mugs & journals' },
]

// Custom order form — plain labels stored on the order. Edit freely.
// The Sticker Bar is an on-site event experience, so it gets its own booking fields on the form.
export const STICKER_BAR = {
  label: 'Sticker Bar (event booking)',
  blurb: 'A build-your-own sticker experience for parties, showers, school & church events, team days and pop-ups.',
  eventTypes: ['Birthday party', 'Baby or bridal shower', 'School or church event', 'Corporate / team event', 'Vendor market or pop-up', 'Other'],
  durations: ['1 hour', '2 hours', '3 hours', '4+ hours'],
}

export const PRODUCT_TYPES = [
  STICKER_BAR.label,
  'Custom stickers & labels',
  '3D printed piece',
  'Custom gift or keepsake',
  'Apparel',
  'Mug or drinkware',
  'Journal or notebook',
  'Vendor essentials (signs, displays, cards)',
  'Brand merch',
  'Digital design or papers',
  'Something else',
]

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
  'Digital proofs or mockups are sent before production. We start making your order only after you approve.',
  'Two rounds of proof revisions are included. Additional revisions or design changes may add cost.',
  'Because every order is custom, deposits are non-refundable once design work has started.',
  'Turnaround times start after proof approval. Rush requests are not guaranteed unless confirmed in writing.',
  'Colors can vary slightly between screens and finished pieces, and 3D-printed items may show small layer lines — that’s part of the handmade process.',
  'You confirm you own or have permission to use any artwork, logos, or images you submit.',
]
