import { useEffect, useState } from 'react'
import { api } from './api'
import { supabase } from './supabase'
import { isIOS, isStandalone } from './pwa'

function urlBase64ToUint8Array(base64) {
  const pad = '='.repeat((4 - base64.length % 4) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

const supported = () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
const vapidKey = async () => (await api('push-config').catch(() => ({}))).vapidPublicKey || ''

// 'on' | 'off' (one tap to allow) | 'blocked' | 'install' (iPhone: install first) | 'setup' (server keys missing) | 'unsupported'
export async function initPush() {
  if (isIOS() && !isStandalone()) return 'install'
  if (!supported()) return 'unsupported'
  const key = await vapidKey()
  if (!key) return 'setup'
  if (Notification.permission === 'denied') return 'blocked'
  if (Notification.permission === 'granted') {
    await subscribe(key) // quietly keeps this device registered
    return 'on'
  }
  return 'off'
}

export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'blocked'
  const key = await vapidKey()
  if (!key) return 'setup'
  await subscribe(key)
  return 'on'
}

async function subscribe(vapidPublicKey) {
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) })
  // Saved straight to Supabase as the signed-in admin (RLS allows it), so it doesn't depend on the API's server key.
  const { error } = await supabase.from('push_subscriptions').upsert({ subscription: sub.toJSON() }, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
}

export function usePush() {
  const [state, setState] = useState('loading')
  useEffect(() => { initPush().then(setState).catch(() => setState('unsupported')) }, [])
  const enable = async () => {
    try { setState(await enablePush()) } catch { setState('blocked') }
  }
  return { state, enable }
}
