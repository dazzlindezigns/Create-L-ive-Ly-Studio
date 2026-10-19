import { useEffect, useState } from 'react'
import { BRAND } from '../brand'

// The installable app is the STUDIO ADMIN only. The manifest + iOS "web app" tags are added
// when an admin page loads, so customers browsing the public site aren't offered an install.
export function enableAdminApp() {
  if (typeof document === 'undefined') return
  const head = document.head
  if (!head.querySelector('link[rel="manifest"]')) {
    head.appendChild(Object.assign(document.createElement('link'), { rel: 'manifest', href: '/manifest.json' }))
  }
  const meta = (name, content) => {
    if (head.querySelector(`meta[name="${name}"]`)) return
    head.appendChild(Object.assign(document.createElement('meta'), { name, content }))
  }
  meta('apple-mobile-web-app-capable', 'yes')
  meta('mobile-web-app-capable', 'yes')
  meta('apple-mobile-web-app-title', BRAND.shortName)
  meta('apple-mobile-web-app-status-bar-style', 'default')
}

export const isAdminPath = (path) => path.startsWith('/dashboard') || path.startsWith('/login')

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

// Chrome/Edge/Android fire `beforeinstallprompt`; we hold onto it for the "Install app" button.
let deferredPrompt = null
const listeners = new Set()
const notify = () => listeners.forEach(fn => fn())
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; notify() })
  window.addEventListener('appinstalled', () => { deferredPrompt = null; notify() })
}

// { mode: 'installed' | 'prompt' | 'ios' | 'manual', install() }
export function useInstallState() {
  const compute = () => isStandalone() ? 'installed' : deferredPrompt ? 'prompt' : isIOS() ? 'ios' : 'manual'
  const [mode, setMode] = useState(compute)
  useEffect(() => {
    const fn = () => setMode(compute())
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  const install = async () => {
    if (!deferredPrompt) return false
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    deferredPrompt = null
    setMode(compute())
    return outcome === 'accepted'
  }
  return { mode, install }
}
