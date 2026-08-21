import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// HashRouter avoids GitHub Pages SPA refresh issues.
// Use base './' so project pages and custom domains both work.
export default defineConfig({
  plugins: [react()],
  base: './',
})
