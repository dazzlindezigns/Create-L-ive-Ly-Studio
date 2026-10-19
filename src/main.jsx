import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { COLORS } from './brand.js'
import './index.css'

// Theme tokens come from src/brand.js so the palette lives in one place.
for (const [name, value] of Object.entries(COLORS)) {
  document.documentElement.style.setProperty(`--${name}`, value)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
