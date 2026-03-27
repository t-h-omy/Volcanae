import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/Volcanae/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      includeAssets: ['favicon.svg', 'icon_*.png'],
      manifest: {
        name: 'Volcanae',
        short_name: 'Volcanae',
        description: 'A top down push forward strategy game',
        theme_color: '#1a0000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: 'icon_72x72.png',
            sizes: '72x72',
            type: 'image/png'
          },
          {
            src: 'icon_96x96.png',
            sizes: '96x96',
            type: 'image/png'
          },
          {
            src: 'icon_128x128.png',
            sizes: '128x128',
            type: 'image/png'
          },
          {
            src: 'icon_144x144.png',
            sizes: '144x144',
            type: 'image/png'
          },
          {
            src: 'icon_152x152.png',
            sizes: '152x152',
            type: 'image/png'
          },
          {
            src: 'icon_192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon_256x256.png',
            sizes: '256x256',
            type: 'image/png'
          },
          {
            src: 'icon_512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icon_512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],
})
