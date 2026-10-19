import { api } from './api'

function urlBase64ToUint8Array(base64) {
  const pad = '='.repeat((4 - base64.length % 4) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// Returns 'unsupported' | 'denied' | 'prompt' | 'granted' (and re-subscribes when granted).
export async function initPush() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  const { vapidPublicKey } = await api('push-config').catch(() => ({}))
  if (!vapidPublicKey) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'granted') {
    await subscribe(vapidPublicKey)
    return 'granted'
  }
  return 'prompt'
}

export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const { vapidPublicKey } = await api('push-config')
  await subscribe(vapidPublicKey)
  return 'granted'
}

async function subscribe(vapidPublicKey) {
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) })
  await api('save-push-sub', { body: { subscription: sub.toJSON() }, auth: true })
}
