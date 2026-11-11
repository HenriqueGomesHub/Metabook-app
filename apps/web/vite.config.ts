import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { clueTexts, slimCatalogue } from '../../packages/core/src/clueSlim';
import type { ClueCountry } from '../../packages/core/src/clues';

const FACTS = fileURLToPath(new URL('../../content/facts/', import.meta.url));
const CLUES = fileURLToPath(new URL('../../content/clues/', import.meta.url));
const NAMES_ID = 'virtual:country-names';
const CATALOGUE_ID = 'virtual:clue-catalogue';
const TEXT_ID = 'virtual:clue-text';

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

/**
 * The clue catalogue (content/clues) as two kinds of module:
 * - `virtual:clue-catalogue`: every country in the compact form of core's `slimCatalogue` (no clue
 *   text), the one chunk loaded up front for cards and lists;
 * - `virtual:clue-text`: a loader per lower-case country code for that country's clue text, each
 *   its own small chunk, fetched when a clue is read.
 */
function clueCatalogue(): Plugin {
  const files = () =>
    readdirSync(CLUES)
      .filter((file) => file.endsWith('.json') && file !== 'index.json')
      .sort();
  const read = (file: string): ClueCountry | undefined => {
    const country = JSON.parse(readFileSync(CLUES + file, 'utf8')) as ClueCountry;
    return Array.isArray(country.clues) ? country : undefined;
  };
  return {
    name: 'metabook-clue-catalogue',
    resolveId: (id) =>
      id === CATALOGUE_ID || id === TEXT_ID || id.startsWith(`${TEXT_ID}/`) ? `\0${id}` : undefined,
    load(id) {
      if (id === `\0${CATALOGUE_ID}`) {
        const countries = files().flatMap((file) => {
          this.addWatchFile(CLUES + file);
          return read(file) ?? [];
        });
        return `export default ${JSON.stringify(slimCatalogue(countries))};`;
      }
      if (id === `\0${TEXT_ID}`) {
        const loaders = files().map((file) => {
          const code = file.replace(/\.json$/, '');
          return `${JSON.stringify(code)}: () => import(${JSON.stringify(`${TEXT_ID}/${code}`)})`;
        });
        return `export default {${loaders.join(',')}};`;
      }
      if (id.startsWith(`\0${TEXT_ID}/`)) {
        const file = `${id.slice(TEXT_ID.length + 2)}.json`;
        this.addWatchFile(CLUES + file);
        const country = read(file);
        return `export default ${JSON.stringify(country ? clueTexts(country) : {})};`;
      }
      return undefined;
    },
  };
}

export default defineConfig({
  plugins: [
    countryNames(),
    clueCatalogue(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        // the ~120 country region maps (assets/<code>-regions-<hash>.js) load on demand: cache
        // each one the first time it is used rather than precaching them all
        globIgnores: ['**/*-regions-*.js'],
        // the clue catalogue chunk is ~2.5 MB (about 0.6 MB compressed); precache it so drills work
        // offline, along with the per-country clue text chunks
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
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
    // screen tests load the whole clue catalogue (16k cards) into the app
    testTimeout: 15_000,
  },
});
