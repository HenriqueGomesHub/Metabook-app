import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { collect, shortHash, useMediaId } from '../collect.mjs';
import { markCollected } from '../mark-collected.mjs';
import { pack } from '../pack.mjs';
import { checkReview } from '../review-check.mjs';
import { applyReviews, cropProblem, entryProblem } from '../review.mjs';

const pool = [
  { code: 'PL', name: 'Poland', continent: 'europe', in_pool: true },
  { code: 'LT', name: 'Lithuania', continent: 'europe', in_pool: true },
];
const temp = (prefix) => mkdtempSync(join(tmpdir(), prefix));
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const image = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: '#406080' } }).webp().toBuffer();

describe('pack', () => {
  const pending = (n, country = 'pl', extra = {}) => ({
    id: uuid(n),
    country,
    subject: 'bollard',
    source: 'commons',
    storage_path: `candidates/h${n}.webp`,
    width: 1024,
    height: 768,
    title: `File ${n}`,
    description: `Post near a town (${n})`,
    ...extra,
  });

  it('shrinks every pending photo to 512px and writes the manifest with original sizes', async () => {
    const big = await image(1024, 768);
    const rows = [pending(1), pending(2, 'lt'), pending(3, 'pl', { width: null, height: null }), pending(4)];
    let active = 0;
    let peak = 0;
    const storage = {
      async download(path) {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        if (path === 'candidates/h4.webp') throw new Error('HTTP 404');
        return big;
      },
    };
    const queue = { listPending: async () => rows };
    const dir = temp('pack-');
    const report = await pack({ storage, queue, outDir: dir, concurrency: 2 });

    assert.deepEqual(report.pl.counts, { packed: 2, failed: 1 });
    assert.deepEqual(report.lt.counts, { packed: 1, failed: 0 });
    assert.match(report.pl.errors[0], /h4|00000004: HTTP 404/);
    assert.ok(peak <= 2, 'never more downloads at once than the concurrency');

    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.map((m) => m.id), [uuid(1), uuid(2), uuid(3)]);
    assert.deepEqual(manifest[0], {
      id: uuid(1),
      country: 'pl',
      subject: 'bollard',
      source: 'commons',
      width: 1024,
      height: 768,
      description: 'Post near a town (1)',
      title: 'File 1',
    });
    // no recorded size: read from the file
    assert.deepEqual([manifest[2].width, manifest[2].height], [1024, 768]);
    const small = await sharp(readFileSync(join(dir, 'img', `${uuid(1)}.webp`))).metadata();
    assert.deepEqual([small.width, small.height, small.format], [512, 384, 'webp']);
    assert.equal(existsSync(join(dir, 'img', `${uuid(4)}.webp`)), false);
  });

  it('keeps to the job countries', async () => {
    const storage = { download: async () => image(300, 200) };
    const queue = { listPending: async () => [pending(1), pending(2, 'lt')] };
    const dir = temp('pack-');
    const report = await pack({ storage, queue, countries: ['lt'], outDir: dir });
    assert.deepEqual(Object.keys(report), ['lt']);
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.map((m) => [m.id, m.width]), [[uuid(2), 1024]]);
    // never enlarged
    const small = await sharp(readFileSync(join(dir, 'img', `${uuid(2)}.webp`))).metadata();
    assert.equal(small.width, 300);
  });
});

const crop = (x, y, w, h) => ({ x, y, w, h });

describe('review validation', () => {
  it('checks crop bounds', () => {
    assert.equal(cropProblem(crop(0, 0, 1, 1)), null);
    assert.equal(cropProblem(crop(0.5, 0.5, 0.50005, 0.5)), null, 'float noise up to 1.0001 is fine');
    assert.match(cropProblem(crop(0.5, 0, 0.6, 1)), /past the image/);
    assert.match(cropProblem(crop(0, 0.95, 1, 0.09)), /at least 0.1/);
    assert.match(cropProblem(crop(-0.1, 0, 0.5, 0.5)), /0..1/);
    assert.match(cropProblem({ x: 0, y: 0, w: '1', h: 1 }), /0..1/);
    assert.match(cropProblem(undefined), /missing/);
  });

  it('checks entries', () => {
    const id = uuid(1);
    assert.equal(entryProblem({ id, reject: 'watermark' }), null);
    assert.equal(entryProblem({ id, uses: [{ subject: 'sign', crop: crop(0, 0, 0.5, 0.5), note: 'Yellow sign' }] }), null);
    assert.match(entryProblem({ id: 'nope', reject: 'x' }), /uuid/);
    assert.match(entryProblem({ id }), /exactly one/);
    assert.match(entryProblem({ id, reject: 'x', uses: [] }), /exactly one/);
    assert.match(entryProblem({ id, reject: ' ' }), /reason/);
    assert.match(entryProblem({ id, uses: [] }), /non-empty/);
    assert.match(entryProblem({ id, uses: [{ subject: 'tree', crop: crop(0, 0, 1, 1) }] }), /bad subject/);
    const use = { subject: 'sign', crop: crop(0, 0, 1, 1) };
    assert.match(entryProblem({ id, uses: [use, use, use, use, use] }), /at most 4/);
  });

  it('review-check also wants every id in the manifest, once', () => {
    const manifest = [{ id: uuid(1) }, { id: uuid(2) }];
    const { problems, counts } = checkReview(
      [
        { id: uuid(1), uses: [{ subject: 'sign', crop: crop(0, 0, 0.5, 0.5) }, { subject: 'guardrail', crop: crop(0, 0.5, 1, 0.5) }] },
        { id: uuid(1), reject: 'duplicate' },
        { id: uuid(3), reject: 'blurry' },
        { id: uuid(2), uses: [{ subject: 'sign', crop: crop(0.95, 0, 0.1, 0.5) }] },
      ],
      manifest,
    );
    assert.deepEqual(problems, [
      `entry 2 (${uuid(1)}): duplicate id`,
      `entry 3 (${uuid(3)}): id not in the manifest`,
      `entry 4 (${uuid(2)}): use 1: crop runs past the image (x+w or y+h > 1)`,
    ]);
    assert.deepEqual(counts, { entries: 4, rejects: 2, uses: 2 });
    assert.deepEqual(checkReview({}, manifest).problems, ['the file must be a JSON array']);
  });
});

/** media_candidates and media_uses in memory, with the unique key and the pending-only updates. */
function fakeDb(candidates) {
  const status = new Map(candidates.map(([id, s]) => [id, s]));
  const uses = [];
  return {
    status,
    uses,
    async statuses(ids) {
      return new Map(ids.filter((id) => status.has(id)).map((id) => [id, status.get(id)]));
    },
    async settlePending(ids, to) {
      const changed = ids.filter((id) => status.get(id) === 'pending');
      for (const id of changed) status.set(id, to);
      return changed;
    },
    async insertUses(rows) {
      for (const row of rows) {
        const key = (u) => `${u.candidate_id}|${u.subject}|${JSON.stringify(u.crop)}`;
        if (!uses.some((u) => key(u) === key(row))) uses.push({ ...row, status: 'suggested' });
      }
    },
  };
}

describe('review', () => {
  const setup = () => {
    const dir = temp('review-');
    writeFileSync(
      join(dir, 'batch-1.json'),
      JSON.stringify([
        { id: uuid(1), reject: 'watermark' },
        {
          id: uuid(2),
          uses: [
            { subject: 'sign', crop: crop(0.123456, 0.2, 0.3, 0.3), note: ' Yellow diamond sign ' },
            { subject: 'guardrail', crop: crop(0, 0.5, 1, 0.5) },
          ],
        },
        { id: uuid(3), uses: [{ subject: 'sign', crop: crop(0.95, 0, 0.1, 0.5) }] },
      ]),
    );
    writeFileSync(
      join(dir, 'batch-2.json'),
      JSON.stringify([
        { id: uuid(4), uses: [{ subject: 'plate', crop: crop(0.4, 0.6, 0.2, 0.15) }] },
        // decided in /curate meanwhile: left alone
        { id: uuid(5), reject: 'blurry' },
        { id: uuid(9), reject: 'blurry' },
        { id: uuid(2), reject: 'second opinion' },
      ]),
    );
    writeFileSync(join(dir, 'notes.txt'), 'ignored');
    const db = fakeDb([
      [uuid(1), 'pending'],
      [uuid(2), 'pending'],
      [uuid(3), 'pending'],
      [uuid(4), 'pending'],
      [uuid(5), 'approved'],
    ]);
    return { dir, db };
  };

  it('rejects, inserts suggested uses, marks reviewed and reports invalid entries', async () => {
    const { dir, db } = setup();
    const { all } = await applyReviews({ queue: db, dir });
    assert.deepEqual(all.counts, { entries: 7, rejected: 1, reviewed: 2, uses: 3, skipped: 1, invalid: 3 });
    assert.deepEqual(all.invalid, [
      `batch-1.json ${uuid(3)}: use 1: crop runs past the image (x+w or y+h > 1)`,
      `batch-2.json ${uuid(2)}: duplicate id`,
      `batch-2.json ${uuid(9)}: no such candidate`,
    ]);
    assert.deepEqual(Object.fromEntries(db.status), {
      [uuid(1)]: 'rejected',
      [uuid(2)]: 'reviewed',
      [uuid(3)]: 'pending',
      [uuid(4)]: 'reviewed',
      [uuid(5)]: 'approved',
    });
    assert.deepEqual(db.uses[0], {
      candidate_id: uuid(2),
      subject: 'sign',
      crop: { x: 0.1235, y: 0.2, w: 0.3, h: 0.3 },
      note: 'Yellow diamond sign',
      status: 'suggested',
    });
    assert.deepEqual(db.uses.map((u) => [u.subject, u.note]), [
      ['sign', 'Yellow diamond sign'],
      ['guardrail', null],
      ['plate', null],
    ]);
  });

  it('is idempotent: a second run changes nothing', async () => {
    const { dir, db } = setup();
    await applyReviews({ queue: db, dir });
    const before = { status: Object.fromEntries(db.status), uses: structuredClone(db.uses) };
    const { all } = await applyReviews({ queue: db, dir });
    assert.deepEqual(all.counts, { entries: 7, rejected: 0, reviewed: 0, uses: 0, skipped: 4, invalid: 3 });
    assert.deepEqual({ status: Object.fromEntries(db.status), uses: db.uses }, before);
  });

  it('finishes a run that stopped between inserting uses and marking reviewed', async () => {
    const { dir, db } = setup();
    const settle = db.settlePending;
    db.settlePending = async (ids, to) => {
      if (to === 'reviewed') throw new Error('network');
      return settle(ids, to);
    };
    await assert.rejects(applyReviews({ queue: db, dir }), /network/);
    assert.equal(db.uses.length, 3);
    db.settlePending = settle;
    const { all } = await applyReviews({ queue: db, dir });
    assert.equal(all.counts.reviewed, 2);
    assert.equal(db.uses.length, 3, 'no duplicate uses');
  });

  it('does nothing without review files', async () => {
    const db = fakeDb([]);
    const { all } = await applyReviews({ queue: db, dir: join(temp('review-'), 'missing') });
    assert.deepEqual(all.counts, { entries: 0, rejected: 0, reviewed: 0, uses: 0, skipped: 0, invalid: 0 });
  });
});

describe('collect uses', () => {
  const candidate = (n, extra = {}) => ({
    id: uuid(n),
    country: 'pl',
    subject: 'bollard',
    region: null,
    storage_path: `candidates/abc${n}.webp`,
    width: 400,
    height: 300,
    credit: 'Ana Ruiz · Wikimedia Commons · CC BY-SA 4.0',
    licence: 'CC BY-SA 4.0',
    licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    source_url: `https://commons.wikimedia.org/wiki/File:${n}.jpg`,
    caption: 'curator caption',
    ...extra,
  });
  const use = (id, cand, subject, c, note = null) => ({
    id,
    candidate_id: cand.id,
    subject,
    crop: c,
    note,
    status: 'approved',
    collected_at: null,
    candidate: cand,
  });

  async function fakeStorage(paths) {
    const files = new Map();
    for (const p of paths) files.set(p, await image(400, 300));
    const uploads = [];
    return {
      files,
      uploads,
      exists: async (path) => files.has(path),
      download: async (path) => {
        if (!files.has(path)) throw new Error(`${path} missing`);
        return files.get(path);
      },
      upload: async (path, body) => {
        uploads.push(path);
        files.set(path, body);
      },
    };
  }

  const queueOf = (uses) => {
    const marked = [];
    return {
      marked,
      listApproved: async () => [],
      markCollected: async () => {},
      listApprovedUses: async () => uses.filter((u) => !u.collected_at),
      markUsesCollected: async (ids) => {
        marked.push(...ids);
        for (const u of uses) if (ids.includes(u.id)) u.collected_at = 'now';
      },
    };
  };

  it('crops each approved use into its own MediaItem, and a re-run adds nothing', async () => {
    const dir = temp('collect-uses-');
    const a = candidate(1);
    const signCrop = crop(0.5, 0, 0.5, 0.5);
    const uses = [
      use('u1', a, 'sign', signCrop, 'Yellow diamond sign'),
      use('u2', a, 'guardrail', crop(0, 0.5, 1, 0.5), 'A guardrail in Poland'),
    ];
    const storage = await fakeStorage([a.storage_path]);
    const report = await collect({ storage, queue: queueOf(uses), contentDir: dir, pool });
    assert.deepEqual(report.pl.counts, { collected: 2, present: 0, skipped: 0, failed: 0 });

    const signId = `abc1-sign-${shortHash(signCrop)}`;
    assert.equal(useMediaId(uses[0]), signId);
    assert.match(shortHash(signCrop), /^[0-9a-f]{8}$/);
    const items = JSON.parse(readFileSync(join(dir, 'media', 'pl.json'), 'utf8'));
    assert.deepEqual(items[0], {
      id: signId,
      country: 'pl',
      subject: 'sign',
      url: `approved/${signId}.webp`,
      credit: a.credit,
      licence: a.licence,
      licenceUrl: a.licence_url,
      sourceUrl: a.source_url,
      caption: 'Yellow diamond sign',
      width: 200,
      height: 150,
      preview: items[0].preview,
    });
    assert.match(items[0].preview, /^data:image\/webp;base64,/);
    // the note names the country: no caption
    assert.equal(items[1].subject, 'guardrail');
    assert.equal(items[1].caption, undefined);
    assert.deepEqual([items[1].width, items[1].height], [400, 150]);
    assert.deepEqual(storage.uploads, [`approved/${signId}.webp`, `approved/${items[1].id}.webp`]);
    assert.ok(storage.files.has(a.storage_path), 'the candidate file stays');

    const again = await collect({ storage, queue: queueOf(uses), contentDir: dir, pool });
    assert.deepEqual(again.pl.counts, { collected: 0, present: 2, skipped: 0, failed: 0 });
    assert.equal(storage.uploads.length, 2);
  });

  it('crops from approved/ when a direct approval already moved the photo, and records a missing one', async () => {
    const dir = temp('collect-uses-');
    const a = candidate(1);
    const b = candidate(2);
    const storage = await fakeStorage(['approved/abc1.webp']);
    const uses = [use('u1', a, 'sign', crop(0, 0, 0.5, 0.5)), use('u2', b, 'plate', crop(0, 0, 0.5, 0.5))];
    const report = await collect({ storage, queue: queueOf(uses), contentDir: dir, pool });
    assert.deepEqual(report.pl.counts, { collected: 1, present: 0, skipped: 0, failed: 1 });
    assert.match(report.pl.errors[0], /2\.jpg \(plate\): candidates\/abc2\.webp not found/);
  });

  it('keeps to the job countries', async () => {
    const dir = temp('collect-uses-');
    const lt = candidate(3, { country: 'lt' });
    const storage = await fakeStorage([lt.storage_path]);
    const report = await collect({ storage, queue: queueOf([use('u3', lt, 'sign', crop(0, 0, 1, 1))]), countries: ['pl'], contentDir: dir, pool });
    assert.deepEqual(report, {});
  });

  it('mark-collected marks the uses whose MediaItem is in content/media', async () => {
    const dir = temp('collect-uses-');
    const a = candidate(1);
    const uses = [use('u1', a, 'sign', crop(0, 0, 0.5, 0.5)), use('u2', a, 'plate', crop(0, 0.5, 0.5, 0.5))];
    mkdirSync(join(dir, 'media'));
    writeFileSync(join(dir, 'media', 'pl.json'), JSON.stringify([{ id: useMediaId(uses[0]) }]));
    const queue = queueOf(uses);
    assert.deepEqual(await markCollected({ queue, contentDir: dir }), {
      marked: 0,
      waiting: 0,
      uses: { marked: 1, waiting: 1 },
    });
    assert.deepEqual(queue.marked, ['u1']);
  });
});

describe('queue (media_uses)', () => {
  it('lists pending rows a page at a time, settles only pending rows and upserts uses', async (t) => {
    const { createQueue } = await import('../queue.mjs');
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      const u = new URL(url);
      calls.push({ url: u, init });
      if (init?.method === 'PATCH') return new Response(JSON.stringify([{ id: 'a' }]));
      if (init?.method === 'POST') return new Response('');
      const offset = Number(u.searchParams.get('offset'));
      return new Response(JSON.stringify(Array.from({ length: offset ? 2 : 1000 }, (_, i) => ({ id: `r${offset + i}` }))));
    });
    const queue = createQueue({ url: 'https://example.supabase.co', key: 'k' });
    assert.equal((await queue.listPending()).length, 1002);
    assert.equal(calls[0].url.searchParams.get('status'), 'eq.pending');

    calls.length = 0;
    assert.deepEqual(await queue.settlePending(['a', 'b'], 'reviewed'), ['a']);
    assert.equal(calls[0].url.searchParams.get('status'), 'eq.pending');
    assert.deepEqual(JSON.parse(calls[0].init.body), { status: 'reviewed' });
    calls.length = 0;
    await queue.settlePending(['a'], 'rejected', '2026-11-09T00:00:00Z');
    assert.deepEqual(JSON.parse(calls[0].init.body), { status: 'rejected', decided_at: '2026-11-09T00:00:00Z' });

    calls.length = 0;
    await queue.insertUses([{ candidate_id: 'a', subject: 'sign', crop: crop(0, 0, 1, 1), note: null }]);
    assert.equal(calls[0].url.pathname, '/rest/v1/media_uses');
    assert.equal(calls[0].url.searchParams.get('on_conflict'), 'candidate_id,subject,crop');
    assert.match(calls[0].init.headers.Prefer, /ignore-duplicates/);
    calls.length = 0;
    await queue.insertUses([]);
    assert.equal(calls.length, 0);
  });

  it('lists approved uses with their candidate, or none before 0005 is run', async (t) => {
    const { createQueue } = await import('../queue.mjs');
    const missing = { code: 'PGRST205', message: "Could not find the table 'public.media_uses' in the schema cache" };
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(missing), { status: 404 }));
    const queue = createQueue({ url: 'https://example.supabase.co', key: 'k' });
    assert.deepEqual(await queue.listApprovedUses(), []);
    const url = new URL(fetch.mock.calls[0].arguments[0]);
    assert.equal(url.searchParams.get('select'), '*,candidate:media_candidates(*)');
    assert.equal(url.searchParams.get('status'), 'eq.approved');
    assert.equal(url.searchParams.get('collected_at'), 'is.null');
    await assert.rejects(queue.insertUses([{ candidate_id: 'a' }]), /0005_media_uses\.sql/);
  });
});

describe('jobs', () => {
  it('accepts the pack and review steps, and the committed review-apply job parses', async () => {
    const { parseJob } = await import('../run-job.mjs');
    assert.deepEqual(parseJob('{"name":"pack","countries":"all","steps":["pack"]}').steps, ['pack']);
    const job = parseJob(readFileSync(new URL('../../../content/jobs/review-apply.json', import.meta.url), 'utf8'));
    assert.deepEqual(job.steps, ['review']);
  });
});
