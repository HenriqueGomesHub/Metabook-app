// The `imagesheets` step: contact sheets for the image review (content/review-images). Every copied,
// non-duplicate image of the clue families in SHEET_FAMILIES, ordered by family then country (then
// catalogue order), 9 to a sheet (a family starts a new sheet), written to review-images/:
//   sheets/<n>.webp  3 x 3 tiles of at most 400 x 300 (aspect kept) with the tile number 1-9 drawn
//                    big in the top-left corner, WebP q70
//   sheets/<n>.json  [{ n, imageId, clueId, country, family, title, width, height }] (width and height
//                    of the bucket file: crops are fractions of it)
//   img/<id>.webp    each image alone, at most 768 px on its longest side, for crop decisions
//   manifest.json    { sheets, images, families: { <family>: { images, sheets: [first, last] } } }
// .github/workflows/review-images.yml runs it and force-pushes review-images/ to the orphan branch
// `review-images`; it is never committed anywhere else.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { CLUES_DIR } from './clues.mjs';
import { ROOT, jsonFilesIn, readJson, writeJson } from './lib/common.mjs';
import { eachLimited } from './pack.mjs';

export const SHEETS_DIR = join(ROOT, 'review-images');
export const SHEET_FAMILIES = ['bollard', 'pole', 'sign', 'line', 'guardrail', 'plate', 'car', 'coverage', 'language'];
export const TILE = { width: 400, height: 300 };
const COLUMNS = 3;
const PER_SHEET = 9;
const GAP = 6;
const SINGLE_MAX = 768;
const QUALITY = 70;
const CONCURRENCY = 8;

/**
 * The images to review, in sheet order: one row per image id (its first clue), skipping images
 * without `path`, with `dupeOf`, already reviewed (`role` set), or of other families.
 */
export function sheetRows(countries, families = SHEET_FAMILIES) {
  const rows = [];
  const seen = new Set();
  for (const family of families) {
    for (const country of [...countries].sort((a, b) => a.country.localeCompare(b.country))) {
      for (const clue of country.clues.filter((c) => c.family === family)) {
        for (const image of clue.images) {
          if (!image.path || image.dupeOf || image.role || seen.has(image.id)) continue;
          seen.add(image.id);
          rows.push({ imageId: image.id, clueId: clue.id, country: country.country, family, title: clue.title, path: image.path, width: image.width, height: image.height });
        }
      }
    }
  }
  return rows;
}

/** Rows → sheets of at most 9, a new sheet at each family; numbered from 1. */
export function paginate(rows) {
  const sheets = [];
  for (const row of rows) {
    const last = sheets.at(-1);
    if (!last || last.length === PER_SHEET || last[0].family !== row.family) sheets.push([row]);
    else last.push(row);
  }
  return sheets.map((rows, i) => ({ n: i + 1, rows: rows.map((row, j) => ({ n: j + 1, ...row })) }));
}

const label = (n) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="84" height="84"><rect x="4" y="4" width="76" height="76" rx="12" fill="#000" fill-opacity="0.75"/>` +
      `<text x="42" y="66" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="60" font-weight="bold" fill="#ffeb3b" text-anchor="middle">${n}</text></svg>`,
  );

/** One tile: the image fitted inside 400 x 300 on a dark cell, its number on top. */
export async function tile(input, n) {
  const fitted = await sharp(input).rotate().resize(TILE.width, TILE.height, { fit: 'inside' }).png().toBuffer();
  const { width, height } = await sharp(fitted).metadata();
  return sharp({ create: { width: TILE.width, height: TILE.height, channels: 3, background: '#303030' } })
    .composite([
      { input: fitted, left: Math.floor((TILE.width - width) / 2), top: Math.floor((TILE.height - height) / 2) },
      { input: label(n), left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

/** Tiles (PNG buffers, in order) → the sheet WebP. */
export async function sheet(tiles) {
  const rows = Math.ceil(tiles.length / COLUMNS);
  const width = COLUMNS * TILE.width + (COLUMNS + 1) * GAP;
  const height = rows * TILE.height + (rows + 1) * GAP;
  return sharp({ create: { width, height, channels: 3, background: '#111111' } })
    .composite(tiles.map((input, i) => ({ input, left: GAP + (i % COLUMNS) * (TILE.width + GAP), top: GAP + Math.floor(i / COLUMNS) * (TILE.height + GAP) })))
    .webp({ quality: QUALITY })
    .toBuffer();
}

export async function runImageSheets({ storage, dir = CLUES_DIR, outDir = SHEETS_DIR, only, families = SHEET_FAMILIES, concurrency = CONCURRENCY } = {}) {
  const countries = jsonFilesIn(dir)
    .filter((f) => f !== 'index.json' && (!only || only.includes(f.replace(/\.json$/, ''))))
    .map((f) => readJson(join(dir, f)));
  const sheets = paginate(sheetRows(countries, families));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'sheets'), { recursive: true });
  mkdirSync(join(outDir, 'img'), { recursive: true });
  const errors = [];
  let failed = 0;
  await eachLimited(sheets, concurrency, async ({ n, rows }) => {
    const tiles = [];
    const listed = [];
    for (const row of rows) {
      try {
        const input = await storage.download(row.path);
        const single = await sharp(input).rotate().resize(SINGLE_MAX, SINGLE_MAX, { fit: 'inside', withoutEnlargement: true }).webp({ quality: QUALITY }).toBuffer();
        writeFileSync(join(outDir, 'img', `${row.imageId}.webp`), single);
        tiles.push(await tile(input, listed.length + 1));
        listed.push({ n: listed.length + 1, imageId: row.imageId, clueId: row.clueId, country: row.country, family: row.family, title: row.title, width: row.width, height: row.height });
      } catch (error) {
        failed++;
        errors.push(`${row.path}: ${error.message}`);
      }
    }
    if (tiles.length) writeFileSync(join(outDir, 'sheets', `${n}.webp`), await sheet(tiles));
    writeJson(join(outDir, 'sheets', `${n}.json`), listed);
  });
  const manifest = { sheets: sheets.length, images: sheets.reduce((s, x) => s + x.rows.length, 0) - failed, families: {} };
  for (const { n, rows } of sheets) {
    const f = (manifest.families[rows[0].family] ??= { images: 0, sheets: [n, n] });
    f.images += rows.length;
    f.sheets[1] = n;
  }
  writeJson(join(outDir, 'manifest.json'), manifest);
  return { counts: { sheets: manifest.sheets, images: manifest.images, failed }, families: manifest.families, errors: errors.slice(0, 100) };
}
