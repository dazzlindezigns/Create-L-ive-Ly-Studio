import { db } from './core.js'

// Sends a web push to every subscribed admin device. Never throws.
export async function notifyAdmins({ title, body, url = '/dashboard', tag }) {
  try {
    const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env
    if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return

    const webpushMod = await import('web-push')
    const webpush = webpushMod.default || webpushMod
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const supabase = db()
    const { data: subs } = await supabase.from('push_subscriptions').select('id, subscription')
    if (!subs?.length) return

    const payload = JSON.stringify({ title, body, url, tag })
    const results = await Promise.allSettled(subs.map(s => webpush.sendNotification(s.subscription, payload)))

    // Drop subscriptions the push service says are gone (device unsubscribed / reinstalled).
    const dead = subs.filter((_, i) => {
      const r = results[i]
      return r.status === 'rejected' && [404, 410].includes(r.reason?.statusCode)
    }).map(s => s.id)
    if (dead.length) await supabase.from('push_subscriptions').delete().in('id', dead)

    const sent = results.filter(r => r.status === 'fulfilled').length
    return { sent, failed: results.length - sent, removed: dead.length }
  } catch (e) {
    console.error('push error:', e)
  }
}
