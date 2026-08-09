import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  // Relative base: the build runs from any sub-path, any host, or straight off a
  // USB stick. Never assume we are served from a domain root.
  base: './',

  build: {
    outDir: 'dist',
    /*
     * Deliberately conservative. These are work phones, not new ones, and a syntax the
     * browser cannot parse fails as a blank page with nothing in the interface to
     * explain it. es2020 covers Safari 14 and Chrome 80 upward at no real cost.
     */
    target: 'es2020',
    rollupOptions: {
      input: {
        main: here('./index.html'),
        'pack-builder': here('./pack-builder.html'),
      },
    },
  },

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Everything is local; never fall back to the network for navigation.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/pack-builder/],
      },
      manifest: {
        name: 'Cronos',
        short_name: 'Cronos',
        description: 'Registro delle ore lavorate',
        theme_color: '#0a0a0a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            // Its own artwork: the OS applies its own mask, so this one is full-bleed
            // with the mark pulled inside the safe circle.
            src: './icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],

  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
} as Parameters<typeof defineConfig>[0])
