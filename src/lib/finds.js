// Shared by the admin editor and /api: only real Amazon links are allowed on Create(L)ive(Ly) Finds.
const AMAZON_HOSTS = /(^|\.)(amazon\.com|amzn\.to|a\.co|amzn\.com)$/i

export function cleanAmazonUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!AMAZON_HOSTS.test(u.hostname)) return null
    u.protocol = 'https:'
    return u.toString()
  } catch { return null }
}
