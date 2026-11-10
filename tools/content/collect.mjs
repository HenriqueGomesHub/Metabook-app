// Approved candidates → content/media/<code>.json: moves each photo to approved/ and appends a
// MediaItem. A row with a crop is cropped instead (images.mjs settings) and uploaded to approved/,
// and its MediaItem gets the cropped size and preview; its candidate file is left in place, so an
// interrupted run can always redo the crop. Idempotent: rows already in content/media are skipped,
// and an uncropped photo already in approved/ is not moved again. It never marks rows collected; mark-collected.mjs does that once
// the commit is pushed, so a failed run is retried in full. Rejected and pending rows are left alone.
// Approved media_uses (agent-suggested crops, 0005_media_uses.sql) become MediaItems of their own:
// approved/<photo id>-<subject>-<crop hash>.webp, cropped from the candidate file, which stays.
// CLI: node tools/content/collect.mjs [--countries pl,lt]
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { cropImage, describeImage } from './images.mjs';
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

/** 8 hex chars of a crop, rounded to 4 decimals so equal crops always hash the same. */
export function shortHash({ x, y, w, h }) {
  const key = [x, y, w, h].map((v) => (Math.round(v * 10000) / 10000).toString()).join(',');
  return createHash('sha1').update(key).digest('hex').slice(0, 8);
}

/** A use's MediaItem id: <photo id>-<subject>-<crop hash> (the photo id has no country in it). */
export const useMediaId = (use) =>
  `${basename(use.candidate.storage_path, '.webp')}-${use.subject}-${shortHash(use.crop)}`;

/**
 * Approved use (with its candidate row as `candidate`) → MediaItem, before the crop sets its
 * size and preview. The note becomes the caption only when it doesn't name the country.
 */
export function useToMediaItem(use, pool = loadPool()) {
  const row = use.candidate;
  const id = useMediaId(use);
  const note = use.note?.trim();
  const item = {
    id,
    country: row.country,
    subject: use.subject,
    region: row.region,
    url: `approved/${id}.webp`,
    credit: row.credit,
    licence: row.licence,
    licenceUrl: row.licence_url,
    sourceUrl: row.source_url,
    caption: note && !captionNamesCountry(note, row.country, pool) ? note : undefined,
  };
  return Object.fromEntries(Object.entries(item).filter(([, v]) => v != null));
}

/**
 * Crops a candidate into approved/ → { width, height, preview } of the cropped photo. It works
 * from the candidate whenever it is there (re-uploading over any earlier attempt, so the crop is
 * always the row's current one); without it, an earlier run's upload is described as it is.
 */
export async function approveCropped(storage, row, to) {
  if (await storage.exists(row.storage_path)) {
    const { webp, ...size } = await cropImage(await storage.download(row.storage_path), row.crop);
    await storage.upload(to, webp);
    return size;
  }
  if (await storage.exists(to)) return describeImage(await storage.download(to));
  throw new Error(`${row.storage_path} not found`);
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
      if (row.crop) Object.assign(item, await approveCropped(storage, row, item.url));
      else if (!(await storage.exists(item.url))) await storage.move(row.storage_path, item.url);
      writeJson(path, [...items, item]);
      entry.counts.collected++;
    } catch (error) {
      entry.counts.failed++;
      entry.errors.push(`${row.source_url}: ${error.message}`);
    }
  }
  for (const use of await queue.listApprovedUses()) {
    const row = use.candidate;
    if (countries && !countries.includes(row.country)) continue;
    const entry = (report[row.country] ??= {
      counts: { collected: 0, present: 0, skipped: 0, failed: 0 },
      errors: [],
      skipped: [],
    });
    try {
      const item = useToMediaItem(use, pool);
      const path = join(contentDir, 'media', `${row.country}.json`);
      const items = readJson(path, []);
      if (items.some((m) => m.id === item.id)) {
        entry.counts.present++;
        continue;
      }
      // the candidate file, or the same photo already moved to approved/ by a direct approval
      const moved = `approved/${basename(row.storage_path)}`;
      const source = (await storage.exists(row.storage_path)) || !(await storage.exists(moved)) ? row.storage_path : moved;
      const size = await approveCropped(storage, { storage_path: source, crop: use.crop }, item.url);
      writeJson(path, [...items, { ...item, ...size }]);
      entry.counts.collected++;
    } catch (error) {
      entry.counts.failed++;
      entry.errors.push(`${row.source_url} (${use.subject}): ${error.message}`);
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
