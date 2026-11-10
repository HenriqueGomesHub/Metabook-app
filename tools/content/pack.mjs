// The review pack: every pending candidate as a small image plus a manifest, for vision agents.
// Writes review-pack/img/<id>.webp (max 512px wide, WebP q70) and review-pack/manifest.json, an
// array of { id, country, subject, source, width, height, description, title } where width and
// height are the candidate file's (crops are fractions of it, so they hold for the small copy too).
// .github/workflows/review-pack.yml runs it and pushes review-pack/ to the orphan branch
// `review-pack`; it is never committed anywhere else.
// CLI: node tools/content/pack.mjs [--countries pl,lt]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { isMain, parseArgs, resolveCountries, ROOT, writeJson } from './lib/common.mjs';

export const PACK_DIR = join(ROOT, 'review-pack');
export const PACK_WIDTH = 512;
const QUALITY = 70;
const CONCURRENCY = 8;

/** Runs `fn` over `items`, at most `limit` at a time. */
export async function eachLimited(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** A candidate file → { webp, width, height } (width and height of the original). */
export async function shrink(input) {
  const { width, height } = await sharp(input).metadata();
  const webp = await sharp(input)
    .rotate()
    .resize({ width: PACK_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();
  return { webp, width, height };
}

/**
 * Packs the pending candidates of `countries` (all of them when not given) into `outDir`.
 * → { <code>: { counts: { packed, failed }, errors } }; a failed download is recorded and left
 * out of the manifest.
 */
export async function pack({ storage, queue, countries, outDir = PACK_DIR, concurrency = CONCURRENCY }) {
  const rows = (await queue.listPending()).filter((r) => !countries || countries.includes(r.country));
  mkdirSync(join(outDir, 'img'), { recursive: true });
  const report = {};
  const entries = [];
  await eachLimited(rows, concurrency, async (row) => {
    const entry = (report[row.country] ??= { counts: { packed: 0, failed: 0 }, errors: [] });
    try {
      const { webp, width, height } = await shrink(await storage.download(row.storage_path));
      writeFileSync(join(outDir, 'img', `${row.id}.webp`), webp);
      entries.push({
        id: row.id,
        country: row.country,
        subject: row.subject,
        source: row.source,
        width: row.width ?? width,
        height: row.height ?? height,
        description: row.description ?? null,
        title: row.title ?? null,
      });
      entry.counts.packed++;
    } catch (error) {
      entry.counts.failed++;
      entry.errors.push(`${row.id}: ${error.message}`);
    }
  });
  // stable order whatever finished first
  const order = new Map(rows.map((r, i) => [r.id, i]));
  entries.sort((a, b) => order.get(a.id) - order.get(b.id));
  writeJson(join(outDir, 'manifest.json'), entries);
  return report;
}

if (isMain(import.meta)) {
  const { countries } = parseArgs();
  const { createStorage } = await import('./storage.mjs');
  const { createQueue } = await import('./queue.mjs');
  const codes = countries ? resolveCountries(countries) : undefined;
  console.log(JSON.stringify(await pack({ storage: createStorage(), queue: createQueue(), countries: codes }), null, 2));
}
