import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        // the ~120 country region maps (assets/<code>-regions-<hash>.js) load on demand: cache
        // each one the first time it is used rather than precaching them all
        globIgnores: ['**/*-regions-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/[a-z]{2}-regions-[\w-]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'region-maps',
              // hashed file names never change, so old entries only age out
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      manifest: {
        name: 'Metabook',
        short_name: 'Metabook',
        theme_color: '#12110F',
        background_color: '#12110F',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
