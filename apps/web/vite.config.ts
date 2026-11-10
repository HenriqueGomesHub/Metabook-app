import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const FACTS = fileURLToPath(new URL('../../content/facts/', import.meta.url));
const NAMES_ID = 'virtual:country-names';

/**
 * `virtual:country-names`: every country's demonyms and capital from content/facts, a few KB, so
 * clue cards can be checked for names that give the answer away without shipping the facts files.
 */
function countryNames(): Plugin {
  return {
    name: 'metabook-country-names',
    resolveId: (id) => (id === NAMES_ID ? `\0${NAMES_ID}` : undefined),
    load(id) {
      if (id !== `\0${NAMES_ID}`) return undefined;
      const names = readdirSync(FACTS)
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => {
          const path = FACTS + file;
          this.addWatchFile(path);
          const facts = JSON.parse(readFileSync(path, 'utf8'));
          return {
            code: String(facts.code).toUpperCase(),
            ...(facts.demonym && { demonym: facts.demonym }),
            ...(facts.capital && { capital: facts.capital }),
          };
        });
      return `export default ${JSON.stringify(names)};`;
    },
  };
}

export default defineConfig({
  plugins: [
    countryNames(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        // the ~120 country region maps (assets/<code>-regions-<hash>.js) load on demand: cache
        // each one the first time it is used rather than precaching them all
        globIgnores: ['**/*-regions-*.js'],
        // the clue catalogue chunk is ~7 MB (about 1.5 MB compressed); precache it so drills work offline
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
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
