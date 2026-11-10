// The `clueimages` step: copies every clue image that has no `path` yet into the private Supabase
// `clues` bucket as <code>/<image id>.webp (at most 1280 px wide, quality 78) and records `path`,
// `width` and `height` in content/clues/<code>.json. Downloads are 0.5 s apart per host; a failed
// image is reported and left for the next run, as is everything after the budget runs out.
import { join } from 'node:path';
import { CLUES_DIR } from './clues.mjs';
import { encodeWebp } from './images.mjs';
import { BROWSER_USER_AGENT, jsonFilesIn, pacer, readJson, request, sleep, writeJson } from './lib/common.mjs';

const SAVE_EVERY = 20;

// plonkit.net answers GitHub's runners with a Cloudflare challenge (HTTP 403). The plonkit-learn repo
// mirrors each tip's image as app/data/img/<slug>/<item id>.webp; pinned to one commit.
const PLONKIT_MIRROR =
  'https://raw.githubusercontent.com/aawwdadstumbal-png/plonkit-learn/044e62780bb008bd42e32b7a896d444a9248efa4/app/data/img';

/** The mirror URL for a Plonk It clue's image, or undefined for other sources. */
export function plonkitMirror(clue) {
  const m = /^https:\/\/www\.plonkit\.net\/([\w-]+)$/.exec(clue.credit?.url ?? '');
  if (!m || clue.credit.source !== 'Plonk It') return undefined;
  return `${PLONKIT_MIRROR}/${m[1]}/${clue.id.slice(clue.id.lastIndexOf('-') + 1)}.webp`;
}

export async function runClueImages({ storage, dir = CLUES_DIR, deadline = Infinity, only, pause = sleep } = {}) {
  const pacers = new Map();
  const download = async (src) => {
    const { host } = new URL(src);
    if (!pacers.has(host)) pacers.set(host, pacer(500, pause));
    await pacers.get(host)();
    const res = await request(src, { headers: { 'User-Agent': BROWSER_USER_AGENT } }, { timeoutMs: 120_000 });
    return Buffer.from(await res.arrayBuffer());
  };
  const done = new Map(); // "<code>/<id>" → { path, width, height }, for an image used by two clues
  const counts = { copied: 0, already: 0, failed: 0 };
  const errors = [];
  let budgetHit = false;

  for (const file of jsonFilesIn(dir).filter((f) => f !== 'index.json')) {
    const code = file.replace(/\.json$/, '');
    if (only && !only.includes(code)) continue;
    const path = join(dir, file);
    const country = readJson(path);
    let unsaved = 0;
    for (const [clue, image] of country.clues.flatMap((c) => c.images.map((img) => [c, img]))) {
      if (image.path) {
        counts.already++;
        continue;
      }
      if (Date.now() >= deadline) {
        budgetHit = true;
        break;
      }
      const key = `${code}/${image.id}`;
      try {
        if (!done.has(key)) {
          const mirror = image.src.startsWith('https://www.plonkit.net/') ? plonkitMirror(clue) : undefined;
          const input = await download(image.src).catch((error) => {
            if (!mirror) throw error;
            return download(mirror);
          });
          const { webp, width, height } = await encodeWebp(input, { width: 1280, quality: 78 });
          await storage.upload(`${key}.webp`, webp);
          done.set(key, { path: `${key}.webp`, width, height });
        }
        Object.assign(image, done.get(key));
        counts.copied++;
        if (++unsaved >= SAVE_EVERY) {
          writeJson(path, country);
          unsaved = 0;
        }
      } catch (error) {
        counts.failed++;
        errors.push(`${key} (${image.src}): ${error.message}`);
      }
    }
    if (unsaved) writeJson(path, country);
    if (budgetHit) break;
  }
  return { counts, errors: errors.slice(0, 100), ...(budgetHit && { budgetHit }) };
}
