// Perceptual hashes of clue images and the duplicates they reveal. Pure (no sharp): the hashes
// are made by the `imagedupes` step (tools/content/imagedupes.mjs) from 9x8 / 8x8 grayscale pixels
// and cached in content/sources/imagehashes.json as { <image id>: { d, a } } (16 hex chars each).

/** Two images of one country are the same picture when their dHashes are this close… */
export const SAME_COUNTRY_D = 6;
/** …and their aHashes too (a guard against dHash collisions on flat, low-detail images). */
export const SAME_COUNTRY_A = 10;
/** Across countries only near-exact copies count, on both hashes. */
export const CROSS_COUNTRY = 3;

/** 64 bits (array of 0/1, most significant first) → 16 hex chars. */
const toHex = (bits) => {
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
  return hex;
};

/** dHash of 9x8 grayscale pixels (row by row): bit = a pixel is brighter than its right neighbour. */
export function dHash(pixels) {
  if (pixels.length !== 72) throw new Error(`dHash needs 9x8 pixels, got ${pixels.length}`);
  const bits = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) bits.push(pixels[row * 9 + col] > pixels[row * 9 + col + 1] ? 1 : 0);
  return toHex(bits);
}

/** aHash of 8x8 grayscale pixels: bit = a pixel is at least the mean. */
export function aHash(pixels) {
  if (pixels.length !== 64) throw new Error(`aHash needs 8x8 pixels, got ${pixels.length}`);
  const mean = pixels.reduce((s, p) => s + p, 0) / 64;
  return toHex([...pixels].map((p) => (p >= mean ? 1 : 0)));
}

const POPCOUNT = Array.from({ length: 16 }, (_, n) => (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1));

/** Number of differing bits of two 16-hex-char hashes. */
export function hamming(x, y) {
  let n = 0;
  for (let i = 0; i < 16; i++) n += POPCOUNT[parseInt(x[i], 16) ^ parseInt(y[i], 16)];
  return n;
}

const isPlonkit = (src) => /^https:\/\/www\.plonkit\.net\//.test(src);
/** The Plonk It page slug an image file belongs to (https://www.plonkit.net/images/<slug>/…). */
export const plonkitFolder = (src) => /^https:\/\/www\.plonkit\.net\/images\/([\w-]+)\//.exec(src)?.[1]?.toLowerCase();

/**
 * Sets `dupeOf` on every image that repeats another of the same country (dropping any old one), and
 * finds near-exact copies across countries.
 *
 * Within a country, images are taken in keep order (Plonk It files before Learnable Meta copies, then
 * Plonk It clues first, then the wider file, then catalogue order); one is a duplicate of the first
 * kept image with the same id (the same file in two clues) or, when both are hashed, with dHash
 * distance ≤ SAME_COUNTRY_D and aHash distance ≤ SAME_COUNTRY_A.
 *
 * Across countries, two kept images whose hashes are both ≤ CROSS_COUNTRY apart are a copy; the copy
 * stays only in the country whose Plonk It page the file comes from (`slugCountry`: page slug → pool
 * code) and gets `dupeOf` (that country's image id) elsewhere. When neither file is a Plonk It page
 * file of either country, both stay and the pair is listed as unresolved.
 *
 * → { within, sameFile, unhashed, crossCountry: [{ imageId, country, clueId, of: { imageId, country,
 * clueId }, d, a, resolved }] }
 */
export function markDupes(countries, hashes, slugCountry = new Map()) {
  const report = { within: 0, sameFile: 0, unhashed: 0, crossCountry: [] };
  const kept = [];
  for (const country of countries) {
    const occurrences = [];
    country.clues.forEach((clue) =>
      clue.images.forEach((image) => {
        delete image.dupeOf;
        occurrences.push({ clue, image, index: occurrences.length });
      }),
    );
    const rank = (o) => [isPlonkit(o.image.src) ? 0 : 1, o.clue.credit?.source === 'Plonk It' ? 0 : 1, -(o.image.width ?? 0), o.index];
    occurrences.sort((p, q) => {
      const [a, b] = [rank(p), rank(q)];
      const i = a.findIndex((v, n) => v !== b[n]);
      return i < 0 ? 0 : a[i] - b[i];
    });
    const keptHere = [];
    const keptIds = new Set();
    for (const o of occurrences) {
      if (keptIds.has(o.image.id)) {
        o.image.dupeOf = o.image.id;
        report.sameFile++;
        continue;
      }
      const hash = hashes[o.image.id];
      if (!hash) report.unhashed++;
      let best;
      if (hash) {
        for (const k of keptHere) {
          const d = hamming(hash.d, k.hash.d);
          if (d > SAME_COUNTRY_D || hamming(hash.a, k.hash.a) > SAME_COUNTRY_A) continue;
          if (!best || d < best.d) best = { k, d };
        }
      }
      if (best) {
        o.image.dupeOf = best.k.image.id;
        report.within++;
        continue;
      }
      keptIds.add(o.image.id);
      if (hash) {
        const entry = { ...o, hash, country: country.country };
        keptHere.push(entry);
        kept.push(entry);
      }
    }
  }

  // pigeonhole: two hashes ≤ 3 bits apart share at least one of their four 16-bit quarters
  const buckets = new Map();
  for (const entry of kept) {
    for (let q = 0; q < 4; q++) {
      const key = `${q}:${entry.hash.d.slice(q * 4, q * 4 + 4)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(entry);
    }
  }
  const pairs = new Map();
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [x, y] = [list[i], list[j]];
        if (x.country === y.country) continue;
        const key = [x, y].map((e) => `${e.country}/${e.clue.id}/${e.image.id}`).sort().join(' ');
        if (pairs.has(key)) continue;
        const d = hamming(x.hash.d, y.hash.d);
        const a = hamming(x.hash.a, y.hash.a);
        if (d <= CROSS_COUNTRY && a <= CROSS_COUNTRY) pairs.set(key, { x, y, d, a });
      }
    }
  }
  const home = (e) => slugCountry.get(plonkitFolder(e.image.src)) === e.country;
  const ref = (e) => ({ imageId: e.image.id, country: e.country, clueId: e.clue.id });
  for (const key of [...pairs.keys()].sort()) {
    const { x, y, d, a } = pairs.get(key);
    const [owner, copy] = home(x) && !home(y) ? [x, y] : home(y) && !home(x) ? [y, x] : [];
    if (owner) {
      copy.image.dupeOf ??= owner.image.id;
      report.crossCountry.push({ ...ref(copy), of: ref(owner), d, a, resolved: true });
    } else {
      report.crossCountry.push({ ...ref(x), of: ref(y), d, a, resolved: false });
    }
  }
  return report;
}
