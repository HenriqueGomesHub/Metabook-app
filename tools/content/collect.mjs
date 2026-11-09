// Approved candidates → content/media/<code>.json: moves each photo to approved/ and appends a
// MediaItem. Idempotent: rows already in content/media are skipped, and a photo already in
// approved/ is not moved again. It never marks rows collected; mark-collected.mjs does that once
// the commit is pushed, so a failed run is retried in full. Rejected and pending rows are left alone.
// CLI: node tools/content/collect.mjs [--countries pl,lt]
import { basename, join } from 'node:path';
import { CONTENT, isMain, loadPool, parseArgs, readJson, resolveCountries, writeJson } from './lib/common.mjs';

/** Table row → MediaItem (optional fields only when set). */
export function toMediaItem(row) {
  const id = basename(row.storage_path, '.webp');
  const item = {
    id,
    country: row.country,
    subject: row.subject,
    region: row.region,
    noteId: row.note_id,
    url: `approved/${id}.webp`,
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

/** True when a caption names the photo's country (validate.mjs would reject the item). */
export function captionNamesCountry(caption, country, pool = loadPool()) {
  const name = pool.find((c) => c.code === country.toUpperCase())?.name;
  return Boolean(caption && name && caption.toLowerCase().includes(name.toLowerCase()));
}

/**
 * Returns { <code>: { counts: { collected, present, skipped, failed }, errors, skipped } } for the
 * countries touched. `present`: already in content/media; `skipped`: caption names the country.
 */
export async function collect({ storage, queue, countries, contentDir = CONTENT, pool = loadPool() }) {
  const rows = (await queue.listApproved()).filter((r) => !countries || countries.includes(r.country));
  const report = {};
  for (const row of rows) {
    const entry = (report[row.country] ??= {
      counts: { collected: 0, present: 0, skipped: 0, failed: 0 },
      errors: [],
      skipped: [],
    });
    try {
      const item = toMediaItem(row);
      const path = join(contentDir, 'media', `${row.country}.json`);
      const items = readJson(path, []);
      if (items.some((m) => m.id === item.id)) {
        entry.counts.present++;
        continue;
      }
      if (captionNamesCountry(item.caption, row.country, pool)) {
        entry.counts.skipped++;
        entry.skipped.push(`${row.source_url}: caption names the country`);
        continue;
      }
      if (!(await storage.exists(item.url))) await storage.move(row.storage_path, item.url);
      writeJson(path, [...items, item]);
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
