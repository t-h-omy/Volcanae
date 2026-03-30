import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { version } from './package.json'

const gitBranch = process.env.GITHUB_REF_NAME || 'local'

const getBasePath = () => {
  if (process.env.VITE_BASE_PATH) {
    return process.env.VITE_BASE_PATH
  }
  const repo = process.env.GITHUB_REPOSITORY
  if (repo) {
    const repoName = repo.split('/')[1]
    return `/${repoName}/`
  }
  return '/Volcanae/'
}

const basePath = getBasePath()

export default defineConfig({
  base: basePath,
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __GIT_BRANCH__: JSON.stringify(gitBranch),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      includeAssets: ['favicon.svg', 'assets/icon_*.png'],
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
            src: 'assets/icon_72x72.png',
            sizes: '72x72',
            type: 'image/png'
          },
          {
            src: 'assets/icon_96x96.png',
            sizes: '96x96',
            type: 'image/png'
          },
          {
            src: 'assets/icon_128x128.png',
            sizes: '128x128',
            type: 'image/png'
          },
          {
            src: 'assets/icon_144x144.png',
            sizes: '144x144',
            type: 'image/png'
          },
          {
            src: 'assets/icon_152x152.png',
            sizes: '152x152',
            type: 'image/png'
          },
          {
            src: 'assets/icon_192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'assets/icon_256x256.png',
            sizes: '256x256',
            type: 'image/png'
          },
          {
            src: 'assets/icon_512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'assets/icon_512x512.png',
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
