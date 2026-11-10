import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { collect } from '../collect.mjs';
import { markCollected } from '../mark-collected.mjs';

const pool = [
  { code: 'PL', name: 'Poland', continent: 'europe', in_pool: true },
  { code: 'LT', name: 'Lithuania', continent: 'europe', in_pool: true },
];

const row = (id, country = 'pl', extra = {}) => ({
  id: `row-${id}`,
  country,
  subject: 'bollard',
  region: null,
  note_id: null,
  storage_path: `candidates/${id}.webp`,
  width: 1280,
  height: 960,
  preview: null,
  credit: 'Ana Ruiz · Wikimedia Commons · CC BY-SA 4.0',
  licence: 'CC BY-SA 4.0',
  licence_url: null,
  source_url: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
  giveaways: [],
  caption: null,
  collected_at: null,
  ...extra,
});

/** A bucket as a set of paths; `move` fails for a missing source like Supabase does. */
function fakeStorage(paths = []) {
  const files = new Set(paths);
  const moves = [];
  return {
    files,
    moves,
    async exists(path) {
      return files.has(path);
    },
    async move(from, to) {
      moves.push([from, to]);
      if (!files.has(from)) throw new Error(`HTTP 400: ${from} not found`);
      files.delete(from);
      files.add(to);
    },
  };
}

function fakeQueue(rows) {
  const marked = [];
  return {
    marked,
    async listApproved({ uncollected = false } = {}) {
      return rows.filter((r) => !uncollected || !r.collected_at);
    },
    async markCollected(ids) {
      marked.push(...ids);
      for (const r of rows) if (ids.includes(r.id)) r.collected_at = '2026-11-09T00:00:00Z';
    },
    async listApprovedUses() {
      return [];
    },
    async markUsesCollected() {},
  };
}

const tempContent = () => mkdtempSync(join(tmpdir(), 'collect-'));
const media = (dir, code) => JSON.parse(readFileSync(join(dir, 'media', `${code}.json`), 'utf8'));

describe('collect', () => {
  it('moves, writes the media item and never marks rows itself', async () => {
    const dir = tempContent();
    const storage = fakeStorage(['candidates/a1.webp']);
    const queue = fakeQueue([row('a1')]);
    const report = await collect({ storage, queue, contentDir: dir, pool });
    assert.deepEqual(report.pl.counts, { collected: 1, present: 0, skipped: 0, failed: 0 });
    assert.deepEqual(media(dir, 'pl').map((m) => m.url), ['approved/a1.webp']);
    assert.ok(storage.files.has('approved/a1.webp'));
    assert.deepEqual(queue.marked, []);
  });

  it('is idempotent: a re-run skips rows in content/media and photos already in approved/', async () => {
    const dir = tempContent();
    const storage = fakeStorage(['candidates/a1.webp', 'candidates/b2.webp']);
    const rows = [row('a1'), row('b2')];
    await collect({ storage, queue: fakeQueue(rows), contentDir: dir, pool });
    // the push failed: nothing was marked, so the next run sees the same rows (plus one moved
    // on an earlier, interrupted run whose media file was never committed)
    const lost = row('c3');
    storage.files.add('approved/c3.webp');
    const again = await collect({ storage, queue: fakeQueue([...rows, lost]), contentDir: dir, pool });
    assert.deepEqual(again.pl.counts, { collected: 1, present: 2, skipped: 0, failed: 0 });
    assert.deepEqual(media(dir, 'pl').map((m) => m.id), ['a1', 'b2', 'c3']);
    assert.equal(storage.moves.length, 2, 'no second move for anything already in approved/');
  });

  it('lists collected rows too, so a row marked before its photo reached main is not lost', async () => {
    const dir = tempContent();
    const storage = fakeStorage(['approved/a1.webp']);
    const queue = fakeQueue([row('a1', 'pl', { collected_at: '2026-11-01T00:00:00Z' })]);
    const report = await collect({ storage, queue, contentDir: dir, pool });
    assert.equal(report.pl.counts.collected, 1);
    assert.deepEqual(media(dir, 'pl').map((m) => m.id), ['a1']);
  });

  it('skips and reports a photo whose caption names its country instead of writing it', async () => {
    const dir = tempContent();
    const storage = fakeStorage(['candidates/a1.webp', 'candidates/b2.webp']);
    const queue = fakeQueue([row('a1', 'pl', { caption: 'A bollard in rural Poland' }), row('b2')]);
    const report = await collect({ storage, queue, contentDir: dir, pool });
    assert.deepEqual(report.pl.counts, { collected: 1, present: 0, skipped: 1, failed: 0 });
    assert.match(report.pl.skipped[0], /a1\.jpg: caption names the country/);
    assert.deepEqual(media(dir, 'pl').map((m) => m.id), ['b2']);
    assert.ok(storage.files.has('candidates/a1.webp'), 'the skipped photo is not moved');
  });

  it('records a failed move and carries on', async () => {
    const dir = tempContent();
    const storage = fakeStorage(['candidates/b2.webp']);
    const report = await collect({ storage, queue: fakeQueue([row('a1'), row('b2')]), contentDir: dir, pool });
    assert.deepEqual(report.pl.counts, { collected: 1, present: 0, skipped: 0, failed: 1 });
    assert.deepEqual(media(dir, 'pl').map((m) => m.id), ['b2']);
  });
});

describe('mark-collected', () => {
  it('marks only uncollected approved rows whose photo is in content/media', async () => {
    const dir = tempContent();
    mkdirSync(join(dir, 'media'));
    writeFileSync(join(dir, 'media', 'pl.json'), JSON.stringify([{ id: 'a1' }, { id: 'b2' }]));
    writeFileSync(join(dir, 'media', 'lt.json'), JSON.stringify([{ id: 'd4' }]));
    const queue = fakeQueue([
      row('a1'),
      row('b2', 'pl', { collected_at: '2026-11-01T00:00:00Z' }),
      row('c3'),
      row('d4', 'lt'),
    ]);
    assert.deepEqual(await markCollected({ queue, contentDir: dir }), { marked: 2, waiting: 1, uses: { marked: 0, waiting: 0 } });
    assert.deepEqual(queue.marked, ['row-a1', 'row-d4']);
  });

  it('marks nothing before anything is in content/media', async () => {
    const queue = fakeQueue([row('a1')]);
    assert.deepEqual(await markCollected({ queue, contentDir: tempContent() }), { marked: 0, waiting: 1, uses: { marked: 0, waiting: 0 } });
    assert.deepEqual(queue.marked, []);
  });
});
