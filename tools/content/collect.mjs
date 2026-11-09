// Approved candidates → content/media/<code>.json: moves each photo to approved/<code>/, appends
// a MediaItem and marks the row collected. Rejected and pending rows are left alone.
// CLI: node tools/content/collect.mjs [--countries pl,lt]
import { basename, join } from 'node:path';
import { CONTENT, isMain, parseArgs, readJson, resolveCountries, writeJson } from './lib/common.mjs';

/** Table row → MediaItem (optional fields only when set). */
export function toMediaItem(row) {
  const id = basename(row.storage_path, '.webp');
  const item = {
    id,
    country: row.country,
    subject: row.subject,
    region: row.region,
    noteId: row.note_id,
    url: `approved/${row.country}/${id}.webp`,
    width: row.width,
    height: row.height,
    preview: row.preview,
    credit: row.credit,
    licence: row.licence,
    licenceUrl: row.licence_url,
    sourceUrl: row.source_url,
    giveaways: row.giveaways?.length ? row.giveaways : undefined,
    caption: row.caption?.trim() || undefined,
  };
  return Object.fromEntries(Object.entries(item).filter(([, v]) => v != null));
}

/** Returns { <code>: { counts: { collected, failed }, errors } } for the countries touched. */
export async function collect({ storage, queue, countries }) {
  const rows = (await queue.listApproved()).filter((r) => !countries || countries.includes(r.country));
  const report = {};
  for (const row of rows) {
    const entry = (report[row.country] ??= { counts: { collected: 0, failed: 0 }, errors: [] });
    try {
      const item = toMediaItem(row);
      await storage.move(row.storage_path, item.url);
      const path = join(CONTENT, 'media', `${row.country}.json`);
      const items = readJson(path, []);
      if (!items.some((m) => m.id === item.id)) writeJson(path, [...items, item]);
      await queue.markCollected(row.id);
      entry.counts.collected++;
    } catch (error) {
      entry.counts.failed++;
      entry.errors.push(`${row.source_url}: ${error.message}`);
    }
  }
  return report;
}

if (isMain(import.meta)) {
  const { countries } = parseArgs();
  const { createStorage } = await import('./storage.mjs');
  const { createQueue } = await import('./queue.mjs');
  const codes = countries ? resolveCountries(countries) : undefined;
  console.log(JSON.stringify(await collect({ storage: createStorage(), queue: createQueue(), countries: codes }), null, 2));
}
