import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build, context } from 'esbuild';
import { loadEnv } from './env.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;
const watch = process.argv.includes('--watch');

const WILDCARD = 'https://*.supabase.co/functions/v1/ingest-rounds';
const ingestUrl = (loadEnv().VITE_METABOOK_INGEST_URL ?? '').trim();

/** Only the configured ingest endpoint (or the Supabase wildcard) is ever granted as a host permission. */
function hostPermission() {
  if (!ingestUrl) return WILDCARD;
  const url = new URL(ingestUrl);
  if (url.protocol !== 'https:') throw new Error('VITE_METABOOK_INGEST_URL must be https');
  return `${url.origin}${url.pathname}`;
}

const common = {
  bundle: true,
  target: 'chrome120',
  legalComments: 'none',
  define: { __INGEST_URL__: JSON.stringify(ingestUrl) },
  logLevel: 'info',
};
const entries = [
  { entryPoints: [`${root}entrypoints/content.ts`], outfile: `${dist}/content.js`, format: 'iife', ...common },
  { entryPoints: [`${root}entrypoints/background.ts`], outfile: `${dist}/background.js`, format: 'iife', ...common },
  { entryPoints: [`${root}entrypoints/popup.ts`], outfile: `${dist}/popup.js`, format: 'iife', ...common },
];

async function copyStatic() {
  const manifest = JSON.parse(await readFile(`${root}manifest.base.json`, 'utf8'));
  manifest.host_permissions = [hostPermission()];
  await writeFile(`${dist}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  await cp(`${root}entrypoints/popup.html`, `${dist}/popup.html`);
  await cp(`${root}entrypoints/popup.css`, `${dist}/popup.css`);
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyStatic();
if (watch) {
  for (const e of entries) await (await context(e)).watch();
} else {
  await Promise.all(entries.map((e) => build(e)));
}
