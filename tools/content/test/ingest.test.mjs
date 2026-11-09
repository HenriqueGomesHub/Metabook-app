import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { processImage } from '../images.mjs';
import { ingest } from '../lib/ingest.mjs';

const jpeg = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: '#7a6' } }).jpeg().toBuffer();

describe('images', () => {
  it('makes a 1024px WebP and a 16px preview data URI', async () => {
    const out = await processImage(await jpeg(2000, 1500));
    assert.deepEqual([out.width, out.height], [1024, 768]);
    assert.equal((await sharp(out.webp).metadata()).format, 'webp');
    assert.match(out.preview, /^data:image\/webp;base64,/);
  });

  it('never enlarges small images', async () => {
    assert.equal((await processImage(await jpeg(900, 600))).width, 900);
  });
});

describe('ingest', () => {
  it('skips queued photos, uploads to candidates/ and queues the rest; one failure is recorded', async (t) => {
    const image = await jpeg(1600, 1200);
    t.mock.method(globalThis, 'fetch', async (url) =>
      String(url).includes('broken') ? new Response('nope', { status: 404 }) : new Response(image),
    );
    const uploads = [];
    const inserted = [];
    const storage = { upload: async (path) => uploads.push(path) };
    const queue = {
      knownSourceUrls: async () => new Set(['https://src/old']),
      insert: async (rows) => inserted.push(...rows),
    };
    const c = (id, sourceUrl, downloadUrl = 'https://img/ok.jpg') => ({ id, country: 'pl', subject: 'pole', sourceUrl, downloadUrl });
    const result = await ingest([c('pl-c1', 'https://src/old'), c('pl-c2', 'https://src/new'), c('pl-c3', 'https://src/b', 'https://img/broken.jpg')], { storage, queue, cap: 5 });
    assert.deepEqual(uploads, ['candidates/pl-c2.webp']);
    assert.deepEqual(inserted.map((r) => [r.storagePath, r.width, r.height]), [['candidates/pl-c2.webp', 1024, 768]]);
    assert.deepEqual(result.counts, { found: 3, alreadyQueued: 1, queued: 1, failed: 1 });
    assert.match(result.errors[0], /https:\/\/src\/b: HTTP 404/);
  });
});
