// The `imagedupes` step: perceptual hashes of every copied clue image, read from the private `clues`
// bucket (its `path`), cached in content/sources/imagehashes.json as { <image id>: { d, a } } (dHash
// of 9x8 and aHash of 8x8 grayscale, 16 hex chars each). Cached ids are skipped, so a re-run only
// hashes new images; the cache is saved every SAVE_EVERY hashes and when the budget runs out. The
// `clues` step then sets `dupeOf` from the cache (lib/phash.mjs markDupes).
import { join } from 'node:path';
import sharp from 'sharp';
import { CLUES_DIR, SOURCES_DIR } from './clues.mjs';
import { jsonFilesIn, readJson, writeJson } from './lib/common.mjs';
import { aHash, dHash } from './lib/phash.mjs';
import { eachLimited } from './pack.mjs';

export const HASHES_FILE = join(SOURCES_DIR, 'imagehashes.json');
const SAVE_EVERY = 200;
const CONCURRENCY = 8;

const gray = (input, width, height) =>
  sharp(input).rotate().flatten({ background: '#ffffff' }).greyscale().resize(width, height, { fit: 'fill' }).raw().toBuffer();

/** Any image sharp reads → { d, a }. */
export async function hashImage(input) {
  const [nine, eight] = await Promise.all([gray(input, 9, 8), gray(input, 8, 8)]);
  return { d: dHash([...nine]), a: aHash([...eight]) };
}

/** Sorted by id, so the cache file diffs cleanly. */
const sorted = (hashes) => Object.fromEntries(Object.keys(hashes).sort().map((id) => [id, hashes[id]]));

export async function runImageDupes({ storage, dir = CLUES_DIR, hashesFile = HASHES_FILE, deadline = Infinity, only, concurrency = CONCURRENCY } = {}) {
  const hashes = readJson(hashesFile, {});
  const counts = { cached: 0, hashed: 0, failed: 0, noPath: 0 };
  const errors = [];
  const todo = new Map(); // image id → bucket path (the first country's copy; every copy is the same file)
  for (const file of jsonFilesIn(dir).filter((f) => f !== 'index.json')) {
    if (only && !only.includes(file.replace(/\.json$/, ''))) continue;
    for (const clue of readJson(join(dir, file)).clues ?? []) {
      for (const image of clue.images) {
        if (!image.path) counts.noPath++;
        else if (hashes[image.id]) counts.cached++;
        else if (!todo.has(image.id)) todo.set(image.id, image.path);
      }
    }
  }
  let budgetHit = false;
  let unsaved = 0;
  await eachLimited([...todo], concurrency, async ([id, path]) => {
    if (Date.now() >= deadline) {
      budgetHit = true;
      return;
    }
    try {
      hashes[id] = await hashImage(await storage.download(path));
      counts.hashed++;
      if (++unsaved >= SAVE_EVERY) {
        writeJson(hashesFile, sorted(hashes));
        unsaved = 0;
      }
    } catch (error) {
      counts.failed++;
      errors.push(`${path}: ${error.message}`);
    }
  });
  writeJson(hashesFile, sorted(hashes));
  return { counts: { ...counts, left: todo.size - counts.hashed - counts.failed }, errors: errors.slice(0, 100), ...(budgetHit && { budgetHit }) };
}
