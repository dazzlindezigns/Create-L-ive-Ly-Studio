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
  website: 'https://createlivelyinc.com', // her Payhip store — not linked from the app, since she may retire it
  logo: '/logo.png',
  ownerFirstName: 'Candis',
  location: 'Brooklyn, NY',
  timezone: 'America/New_York',
  pickupLabel: 'Local pickup (Brooklyn, NY)',
  instagram: '',
  // Shown on the Privacy Policy and Terms pages as the way to reach her. Leave '' to say "reply to any email from us".
  contactEmail: '',
  legalState: 'New York', // governing law on the Terms page
  legalUpdated: 'October 24, 2026', // change when the Privacy Policy or Terms text changes
}

// Footer credit for the agency that built this app.
export const BUILT_BY = { name: 'Dani Creates It', url: 'https://makeme.danicreatesit.com' }

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
  star: '#E8A33D',        // review stars
  starOff: '#DDD2D5',     // empty review stars
}

export const FONTS = {
  body: "'Montserrat', Arial, sans-serif",
  heading: "'Playfair Display', Georgia, serif",
  script: "'Dancing Script', cursive",
}

// Her storefront collections. Shop products are tagged with one of these keys.
// `featured` collections get their own homepage section instead of a tile.
export const COLLECTIONS = [
  { key: 'sticker-bar', name: 'Sticker Bar', image: '/img/sticker-bar/collection.webp', featured: true, blurb: 'Sticker sheets with personality — digital or vinyl',
    description: 'Twelve-sticker sheets for planners, journals, laptops and water bottles. Grab them as an instant download or premium waterproof vinyl, and stack & save when you mix sheets.' },
  { key: 'labs', name: 'Labs', image: '/img/labs.webp', blurb: '3D printed creations, specialty pieces & personalized accessories',
    description: 'Explore custom 3D printed creations, specialty pieces, personalized accessories, and innovative designs made to stand out.' },
  { key: 'paper-studio', name: 'Paper Studio', image: '/img/paper-studio.webp', blurb: 'Digital papers, seamless patterns & downloadable designs',
    description: 'Discover beautiful digital papers, seamless patterns, creative backgrounds, and downloadable designs for your next creative project.' },
  { key: 'vendors', name: 'Vendors', image: '/img/vendors.webp', blurb: 'Branded essentials, business accessories & display pieces',
    description: 'Elevate your vendor table with branded essentials, business accessories, display pieces, and products designed to help your business make an impression.' },
  { key: 'elevate', name: 'Elevate', image: '/img/elevate.webp', blurb: 'Empowering apparel, inspirational mugs & journals',
    description: 'Wear your confidence and sip with purpose. Discover empowering apparel, inspirational mugs, journals, and everyday essentials designed to encourage and inspire.' },
]

// Homepage copy (from her storefront). Edit freely.
export const SITE = {
  heroImage: '/img/hero.webp',
  heroTitle: 'Custom creations made',
  heroAccent: 'with purpose.',
  heroIntro: 'Welcome to Create(L)ive(Ly) Studio — where creativity, meaningful details, and custom designs come together. From personalized gifts and keepsakes to 3D printed creations, digital papers, vendor essentials, and empowering merchandise, every piece is created to make an impression.',
  badges: ['3D Prints', 'Custom Gifts', 'Keepsakes', 'Vendor Essentials', 'Digital Papers', 'Empowering Merch', 'Sticker Bar'],
  about: "At Create(L)ive(Ly) Studio, we believe the little details make the biggest impressions. Whether you're celebrating someone special, honoring a loved one, building your brand, creating something beautiful, or simply treating yourself, our collections are designed to bring creativity and meaning together.",
}

// The Sticker Bar — her sticker-sheet line ("a Create.(L)ive.Ly Studio company").
// Each sheet is ONE product sold two ways: a printable digital download and a physical vinyl
// sheet (Products → "Also sell as a digital download"). Sheets mix-and-match toward Stack & Save.
export const STICKER_BAR = {
  collection: 'sticker-bar',      // products.collection key
  name: 'Sticker Bar',
  logo: '/img/sticker-bar/logo.webp',
  tagline: 'Serving up stickers with personality',
  motto: 'pick. peel. stick.',
  headline: 'Sticker sheets for the life you’re already living',
  intro: 'Twelve-sticker collections, digital or vinyl, made to sit right where your day already lives — planner, laptop, water bottle, wall.',
  perks: [
    ['⚡', 'Instant digital delivery', 'Your download link lands in your inbox the second checkout completes.'],
    ['📦', 'Ships in 3 days', 'Premium waterproof vinyl, packed flat so nothing bends.'],
    ['✨', 'New sheets every month', 'Fresh drops for every mood and season.'],
  ],
  badges: ['New', 'Sale', 'Bestseller', 'Back in stock', 'Limited'],
  // Shown on the homepage until her sheets are live in the shop.
  showcase: ['peace-in-progress', 'brooklyn-block-party', 'autumn-book-babe', 'amalfi-coast-girl', 'summer-block-party', 'retro-girl-era']
    .map(k => `/img/sticker-bar/${k}.webp`),
}

// Communities and products she recommends (affiliate links). Shown on the homepage.
// Keep `disclosure` — affiliate links must say she may earn a commission.
export const PARTNERS = [
  {
    key: 'black-girls-journal-club',
    name: 'Black Girls Journal Club',
    kicker: 'Online Community',
    image: '/img/partners/black-girls-journal-club.webp',
    imageAlt: 'Black Girls Journal Club is a space where Black women come to reflect, grow, and write their stories with ease.',
    description: 'A creative community for Black women who love journaling, crafting, digital design and learning how to turn their creativity into something more.',
    cta: 'Join the Community',
    url: 'https://www.skool.com/blackgirlsjournalclub/about?ref=918885b1fd484a8696e60d3686cfd3bb',
    disclosure: 'Affiliate link: I may earn a commission if you join through this link, at no additional cost to you.',
  },
]

// Suggested "shop is closed" message (Products → Shop settings → "Use the template message").
export const SHOP_CLOSED_TEMPLATE = "We're taking a short creative break to restock and catch up on custom orders. 💕 The shop will reopen soon — custom requests are still open, so tap “Request a custom item” to start yours. Thank you for your patience and support!"

// Custom order form — plain labels stored on the order. Edit freely.
export const PRODUCT_TYPES = [
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

// Stack & Save: % off every eligible item once the cart holds N+ of them (any products, any mix).
// Defaults — she edits them in Shop → Products (saved in settings.stack_save_tiers).
export const STACK_TIERS = [{ min: 3, pct: 10 }, { min: 5, pct: 15 }, { min: 8, pct: 20 }]

// Her partner (affiliate) program. Rename it here and it changes everywhere — pages and emails.
// Hand emojis carry a brown skin tone (🏾) throughout the app.
export const PARTNER_PROGRAM = {
  name: 'The LiveLy Circle',
  short: 'LiveLy Circle',
  icon: '🤝🏾',
  wave: '👋🏾',
}
// How she can pay partners (the partner's handle goes with it, e.g. Cash App $tasha).
export const PAYOUT_METHODS = ['Cash App', 'Zelle', 'PayPal', 'Venmo', 'Other']

// Refunds: only ready-made physical shop items can be refunded. Shown at checkout, on product
// pages, receipts and download emails so it's clear before anyone pays.
export const REFUND_POLICY = {
  digital: 'Digital downloads are final sale — no refunds or exchanges.',
  custom: 'Custom orders are made just for you and are final sale — no refunds.',
  physical: 'Only ready-made physical items from the shop can be refunded.',
}

export const QUOTE_TERMS = [
  'Your order goes into production once the deposit (or full payment) is received.',
  'Digital proofs or mockups are sent before production. We start making your order only after you approve.',
  'Two rounds of proof revisions are included. Additional revisions or design changes may add cost.',
  'Custom orders are made just for you, so they’re final sale — payments and deposits are non-refundable.',
  'Turnaround times start after proof approval. Rush requests are not guaranteed unless confirmed in writing.',
  'Colors can vary slightly between screens and finished pieces, and 3D-printed items may show small layer lines — that’s part of the handmade process.',
  'You confirm you own or have permission to use any artwork, logos, or images you submit.',
]

// Starter templates for emails written in the app (Order → Emails). Placeholders:
// {firstName} {product} {orderNumber} {owner} {business} {location}. She edits the text before sending.
export const EMAIL_TEMPLATES = [
  {
    key: 'update',
    label: 'Order update',
    subject: 'An update on your {product} order',
    body: "Hi {firstName}!\n\nI wanted to give you a quick update on your order — \n\nThank you so much for your patience and for choosing {business}.\n\nWith love,\n{owner}",
  },
  {
    key: 'pickup',
    label: 'Ready for pickup',
    subject: 'Your order is ready for pickup! 🎉',
    body: "Hi {firstName}!\n\nGreat news — your {product} order is ready for pickup in {location}. Reply to this email with a day and time that works for you and I'll get it ready.\n\nCan't wait for you to see it!\n{owner}",
  },
  {
    key: 'delay',
    label: 'Running a little behind',
    subject: 'A quick heads-up about your order',
    body: "Hi {firstName},\n\nI want to be upfront with you: your {product} order is taking a little longer than planned because \n\nMy new estimate is . I'd rather take the extra time to make it right than rush it. Thank you for understanding.\n\n{owner}",
  },
  {
    key: 'quote_followup',
    label: 'Quote follow-up',
    subject: 'Checking in on your quote',
    body: "Hi {firstName}!\n\nJust checking in on the quote I sent for your {product}. Do you have any questions, or anything you'd like to adjust? I'm happy to help.\n\n{owner}",
  },
  {
    key: 'more_info',
    label: 'Need more details',
    subject: 'A few quick questions about your order',
    body: "Hi {firstName}!\n\nThank you for your request! Before I put your quote together, could you tell me:\n\n• \n• \n\nThanks so much!\n{owner}",
  },
  {
    key: 'thank_you',
    label: 'Thank you',
    subject: 'Thank you for your order 💕',
    body: "Hi {firstName}!\n\nThank you so much for trusting {business} with your {product}. I hope it brings a smile every time you see it.\n\nIf you love it, I'd be so grateful if you shared a photo and tagged us!\n\nWith gratitude,\n{owner}",
  },
]
