import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-512.svg', 'icon-192.svg'],
      manifest: {
        name: 'Momomaya POS',
        short_name: 'Momomaya',
        description: 'A simple point-of-sale application for Momomaya to create and print customer bills.',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FDFBF5',
        theme_color: '#D95323',
        icons: [
          {
            src: '/icon-192.svg',
            type: 'image/svg+xml',
            sizes: '192x192',
            purpose: 'any maskable'
          },
          {
            src: '/icon-512.svg',
            type: 'image/svg+xml',
            sizes: '512x512',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
