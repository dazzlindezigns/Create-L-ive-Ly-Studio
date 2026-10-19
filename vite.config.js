import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { BRAND, COLORS } from './src/brand.js'

// Injects brand name + theme color into index.html so src/brand.js stays the single source.
const brandHtml = () => ({
  name: 'brand-html',
  transformIndexHtml: (html) => html
    .replaceAll('__BRAND_NAME__', BRAND.name)
    .replaceAll('__BRAND_SHORT__', BRAND.shortName)
    .replaceAll('__BRAND_TAGLINE__', BRAND.tagline)
    .replaceAll('__THEME_COLOR__', COLORS.primary),
})

export default defineConfig({
  plugins: [react(), brandHtml()],
})
