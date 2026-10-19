// Service worker: makes the app installable and shows admin push notifications.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Network passthrough — required for installability; no offline caching of order data.
self.addEventListener('fetch', () => {})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data.json() } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'New activity', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/dashboard' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
