// Input sanitizers for customer-submitted data.
import { APP_URL } from './core.js'

// Only keep URLs that point at our own public Supabase storage bucket,
// so customers can't attach arbitrary links that we later render in emails.
export function storageUrlsOnly(urls, bucket) {
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const prefix = `${base}/storage/v1/object/public/${bucket}/`
  if (!Array.isArray(urls) || !base) return null
  const clean = urls.filter(u => typeof u === 'string' && u.startsWith(prefix)).slice(0, 20)
  return clean.length ? clean : null
}

// Product photos for the AI listing tools: her uploads in product-images, or photos that ship
// with the site under /img/ (the seeded Sticker Bar sheets). Returns absolute URLs.
export function productPhotoUrls(urls) {
  if (!Array.isArray(urls)) return []
  return urls.flatMap(u => {
    if (typeof u !== 'string') return []
    if (/^\/img\/[\w-]+(\/[\w-]+)*\.(webp|png|jpe?g)$/i.test(u)) return [APP_URL + u]
    return storageUrlsOnly([u], 'product-images') || []
  })
}

export function cleanAddress(a, fallbackName) {
  if (!a || typeof a !== 'object') return null
  const s = (v, n = 120) => String(v || '').trim().slice(0, n)
  const addr = {
    name: s(a.name) || s(fallbackName),
    street: s(a.street),
    street2: s(a.street2),
    city: s(a.city, 80),
    state: s(a.state, 2).toUpperCase(),
    zip: s(a.zip, 10),
  }
  if (!addr.street || !addr.city || !/^[A-Z]{2}$/.test(addr.state) || !/^\d{5}(-\d{4})?$/.test(addr.zip)) return null
  return addr
}

export function formatAddress(a) {
  if (!a) return ''
  return [a.street, a.street2, a.city].filter(Boolean).join(', ') + `, ${a.state} ${a.zip}`
}
