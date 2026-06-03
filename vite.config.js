import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.svg'],
      manifest: {
        name: 'Amdaro Together',
        short_name: 'Amdaro',
        description: 'Collaborate on PDFs in real-time. Draw, annotate, and study together.',
        theme_color: '#0d0d0e',
        background_color: '#0d0d0e',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'logo.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: 'logo.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'ws://127.0.0.1:3001',
        ws: true
      },
      '/uploads': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      }
    }
  }
})

