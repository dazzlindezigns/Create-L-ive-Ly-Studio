import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { COLORS } from './brand.js'
import { enableAdminApp, isAdminPath } from './lib/pwa.js'
import { captureRef, capturePartnerSelf } from './lib/ref.js'
import './index.css'

// Old links on the Vercel address (shared partner links, sent emails) move to the real domain,
// keeping the same page and ?ref / ?partner codes. Only happens once VITE_APP_URL is set to a
// different domain (production), so previews and local dev are untouched.
const home = import.meta.env.VITE_APP_URL && new URL(import.meta.env.VITE_APP_URL)
if (home && window.location.hostname.endsWith('.vercel.app') && home.hostname !== window.location.hostname) {
  window.location.replace(home.origin + window.location.pathname + window.location.search + window.location.hash)
}

// Theme tokens come from src/brand.js so the palette lives in one place.
for (const [name, value] of Object.entries(COLORS)) {
  document.documentElement.style.setProperty(`--${name}`, value)
}

// Admin pages are installable; set this up before render so the browser sees it on first load.
if (isAdminPath(window.location.pathname)) enableAdminApp()
else { captureRef(); capturePartnerSelf() } // partner links: ?ref=CODE, and ?partner=<token> for their own shopping

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
