import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { collect } from '../collect.mjs';
import { cropBox, cropImage, extractCrop } from '../images.mjs';

const pool = [{ code: 'PL', name: 'Poland', continent: 'europe', in_pool: true }];

/** A W×H image whose pixel (x, y) is rgb(x * sx, y * sy, 0), so a pixel says where it came from. */
function coordinateImage(width, height, sx = 25, sy = 30) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set([x * sx, y * sy, 0], (y * width + x) * 3);
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

const pixels = async (png) => sharp(png).raw().toBuffer({ resolveWithObject: true });

describe('cropBox', () => {
  it('turns fractions into pixel edges, rounding each edge', () => {
    // 10×8: left 2.5 → 3, right 7.5 → 8; top 4, bottom 8
    assert.deepEqual(cropBox({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 }, 10, 8), { left: 3, top: 4, width: 5, height: 4 });
    // a third: left 3.33 → 3, and the right edge lands on the image's (10), not at 3 + round(6.67)
    assert.deepEqual(cropBox({ x: 1 / 3, y: 0, w: 2 / 3, h: 1 }, 10, 8), { left: 3, top: 0, width: 7, height: 8 });
  });

  it('keeps the region inside the image and at least one pixel', () => {
    // float noise past the right and bottom edges
    assert.deepEqual(cropBox({ x: 0.4, y: 0.25, w: 0.6000001, h: 0.7500001 }, 10, 8), { left: 4, top: 2, width: 6, height: 6 });
    assert.deepEqual(cropBox({ x: -0.1, y: 0, w: 1.3, h: 1 }, 10, 8), { left: 0, top: 0, width: 10, height: 8 });
    assert.deepEqual(cropBox({ x: 0.99, y: 0.99, w: 0.001, h: 0.001 }, 10, 8), { left: 9, top: 7, width: 1, height: 1 });
    assert.throws(() => cropBox({ x: 0, y: 0, w: 0, h: 1 }, 10, 8), /bad crop/);
    assert.throws(() => cropBox({ x: 0, y: 0 }, 10, 8), /bad crop/);
  });
});

describe('extractCrop and cropImage', () => {
  it('extracts exactly the pixels the fractions name', async () => {
    const { data, info } = await pixels(await extractCrop(await coordinateImage(10, 8), { x: 0.25, y: 0.5, w: 0.5, h: 0.5 }));
    assert.deepEqual([info.width, info.height], [5, 4]);
    // first pixel came from (3, 4), last from (7, 7)
    assert.deepEqual([...data.subarray(0, 2)], [3 * 25, 4 * 30]);
    const last = (info.width * info.height - 1) * info.channels;
    assert.deepEqual([...data.subarray(last, last + 2)], [7 * 25, 7 * 30]);
  });

  it('includes the last row and column for a crop reaching the edges', async () => {
    const { data, info } = await pixels(await extractCrop(await coordinateImage(10, 8), { x: 2 / 3, y: 0.625, w: 1 / 3, h: 0.375 }));
    // left 6.67 → 7, top 5: columns 7–9, rows 5–7
    assert.deepEqual([info.width, info.height], [3, 3]);
    const last = (info.width * info.height - 1) * info.channels;
    assert.deepEqual([...data.subarray(last, last + 2)], [9 * 25, 7 * 30]);
  });

  it('re-encodes like processImage: at most 1024 wide, WebP, with a new preview', async () => {
    const big = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: '#406080' } }).png().toBuffer();
    const out = await cropImage(big, { x: 0.5, y: 0, w: 0.5, h: 1 });
    assert.deepEqual([out.width, out.height], [1024, 683]);
    assert.equal((await sharp(out.webp).metadata()).format, 'webp');
    assert.match(out.preview, /^data:image\/webp;base64,/);
  });
});

/** A bucket of path → bytes. */
function bucket(entries) {
  const files = new Map(entries);
  const log = [];
  return {
    files,
    log,
    async exists(path) {
      return files.has(path);
    },
    async download(path) {
      if (!files.has(path)) throw new Error(`HTTP 404: ${path}`);
      return files.get(path);
    },
    async upload(path, body) {
      log.push(['upload', path]);
      files.set(path, body);
    },
    async move(from, to) {
      log.push(['move', from, to]);
      files.set(to, files.get(from));
      files.delete(from);
    },
  };
}

const row = (id, crop) => ({
  id: `row-${id}`,
  country: 'pl',
  subject: 'bollard',
  region: null,
  note_id: null,
  storage_path: `candidates/${id}.webp`,
  width: 40,
  height: 30,
  preview: 'data:image/webp;base64,original',
  credit: 'Ana Ruiz · Wikimedia Commons · CC BY-SA 4.0',
  licence: 'CC BY-SA 4.0',
  licence_url: null,
  source_url: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
  giveaways: [],
  caption: null,
  crop,
  collected_at: null,
});
const queue = (rows) => ({ listApproved: async () => rows, listApprovedUses: async () => [] });
const media = (dir) => JSON.parse(readFileSync(join(dir, 'media', 'pl.json'), 'utf8'));

describe('collect with crops', () => {
  it('crops into approved/, keeps the candidate, and records the cropped size and preview', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crop-'));
    const photo = await sharp(await coordinateImage(40, 30, 6, 8)).webp({ lossless: true }).toBuffer();
    const storage = bucket([['candidates/c1.webp', photo], ['candidates/p2.webp', photo]]);
    const rows = [row('c1', { x: 0.5, y: 0, w: 0.5, h: 0.5 }), row('p2', null)];

    const report = await collect({ storage, queue: queue(rows), contentDir: dir, pool });
    assert.deepEqual(report.pl.counts, { collected: 2, present: 0, skipped: 0, failed: 0 });
    const [cropped, plain] = media(dir);
    assert.deepEqual([cropped.width, cropped.height], [20, 15]);
    assert.match(cropped.preview, /^data:image\/webp;base64,/);
    assert.notEqual(cropped.preview, 'data:image/webp;base64,original');
    const uploaded = await sharp(storage.files.get('approved/c1.webp')).metadata();
    assert.deepEqual([uploaded.width, uploaded.height], [20, 15]);
    assert.ok(storage.files.has('candidates/c1.webp'), 'the candidate stays');
    // the uncropped row is still a plain move, with the row's own size and preview
    assert.deepEqual([plain.width, plain.height, plain.preview], [40, 30, 'data:image/webp;base64,original']);
    assert.deepEqual(storage.log, [['upload', 'approved/c1.webp'], ['move', 'candidates/p2.webp', 'approved/p2.webp']]);

    // a re-run finds both in content/media and touches nothing
    const again = await collect({ storage, queue: queue(rows), contentDir: dir, pool });
    assert.deepEqual(again.pl.counts, { collected: 0, present: 2, skipped: 0, failed: 0 });
    assert.equal(storage.log.length, 2);
  });

  it('after an interrupted run: re-crops from the candidate, or describes the upload when it is gone', async () => {
    const photo = await sharp(await coordinateImage(40, 30, 6, 8)).webp({ lossless: true }).toBuffer();
    const crop = { x: 0, y: 0, w: 0.25, h: 0.5 };
    const done = await cropImage(photo, crop);

    const withCandidate = bucket([['candidates/c1.webp', photo], ['approved/c1.webp', done.webp]]);
    const dir1 = mkdtempSync(join(tmpdir(), 'crop-'));
    await collect({ storage: withCandidate, queue: queue([row('c1', crop)]), contentDir: dir1, pool });
    assert.deepEqual(media(dir1).map((m) => [m.width, m.height]), [[10, 15]]);

    const uploadOnly = bucket([['approved/c1.webp', done.webp]]);
    const dir2 = mkdtempSync(join(tmpdir(), 'crop-'));
    const report = await collect({ storage: uploadOnly, queue: queue([row('c1', crop)]), contentDir: dir2, pool });
    assert.equal(report.pl.counts.collected, 1);
    const [described] = media(dir2);
    assert.deepEqual([described.width, described.height], [10, 15]);
    assert.match(described.preview, /^data:image\/webp;base64,/);
    assert.deepEqual(uploadOnly.log, [], 'nothing uploaded or moved');

    const neither = bucket([]);
    const failed = await collect({ storage: neither, queue: queue([row('c1', crop)]), contentDir: mkdtempSync(join(tmpdir(), 'crop-')), pool });
    assert.deepEqual(failed.pl.counts, { collected: 0, present: 0, skipped: 0, failed: 1 });
  });
});
