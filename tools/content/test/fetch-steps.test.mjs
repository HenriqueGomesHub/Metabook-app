// The network steps (plonkit, learnablemeta, links, clueimages, wipemedia) against fake responses.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { runClueImages } from '../clueimages.mjs';
import { mapsOf, parseMapData, runLearnableMeta } from '../learnablemeta.mjs';
import { isMapsLink, parseMapsUrl, plonkitImageLinks, resolveLink, runLinks } from '../links.mjs';
import { pacer } from '../lib/common.mjs';
import { guideCountries, isFresh, parsePreloaded, runPlonkit } from '../plonkit.mjs';
import { parseJob } from '../run-job.mjs';
import { createStorage } from '../storage.mjs';
import { wipeMedia } from '../wipemedia.mjs';

const temp = (prefix) => mkdtempSync(join(tmpdir(), prefix));
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const html = (data) => `<html><script id="__PRELOADED_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
const noPause = async () => {};
const response = (body, init = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), init);

describe('jobs', () => {
  it('accepts the clue steps and a positive refreshDays', () => {
    const job = parseJob('{"name":"clues-fetch","countries":"all","steps":["plonkit","learnablemeta","links","clues"],"budgetMinutes":80}');
    assert.deepEqual(job.steps, ['plonkit', 'learnablemeta', 'links', 'clues']);
    assert.deepEqual(parseJob('{"name":"w","countries":"all","steps":["clueimages","wipemedia"]}').steps, ['clueimages', 'wipemedia']);
    assert.throws(() => parseJob('{"name":"x","countries":"all","steps":["plonkit"],"refreshDays":0}'), /refreshDays/);
  });
});

describe('pacer', () => {
  it('waits only for what is left of the interval', async () => {
    let now = 0;
    const waits = [];
    const wait = pacer(1000, async (ms) => { waits.push(ms); now += ms; }, () => now);
    await wait();
    now += 300;
    await wait();
    now += 2000;
    await wait();
    assert.deepEqual(waits, [700]);
  });
});

describe('plonkit', () => {
  it('reads the embedded JSON and the guide in either shape', () => {
    assert.deepEqual(parsePreloaded(html({ a: 1 })), { a: 1 });
    assert.equal(parsePreloaded('<html>Just a moment...</html>'), null);
    const rows = [['Albania', 'albania', 'AL', ['Europe'], 35, '/x.png'], { title: 'Maps', slug: 'maps', code: 'XX' }, { title: 'Poland', slug: 'poland', code: 'PL' }];
    assert.deepEqual(guideCountries({ success: true, data: rows }), [
      { title: 'Albania', slug: 'albania', code: 'AL' },
      { title: 'Poland', slug: 'poland', code: 'PL' },
    ]);
    assert.deepEqual(guideCountries(rows).length, 2);
    assert.equal(isFresh({ fetchedAt: '2026-01-01T00:00:00Z' }, undefined), true);
    assert.equal(isFresh({ fetchedAt: '2026-01-01T00:00:00Z' }, 7, Date.parse('2026-01-09T00:00:00Z')), false);
    assert.equal(isFresh(undefined, undefined), false);
  });

  it('caches every page, retrying a challenge page, and skips cached pages on the next run', async () => {
    const dir = temp('plonkit-');
    const page = JSON.parse(readFileSync(new URL('fixtures/plonkit/poland.json', import.meta.url), 'utf8'));
    let polandCalls = 0;
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      if (url.endsWith('/guide')) return response(html({ success: true, data: [{ title: 'Poland', slug: 'poland', code: 'PL' }, { slug: 'middle-earth' }] }));
      if (url.endsWith('/poland')) return response(++polandCalls === 1 ? '<html>Just a moment...</html>' : html(page), { status: polandCalls === 1 ? 403 : 200 });
      return response('', { status: 404 });
    };
    const pauses = [];
    const first = await runPlonkit({ dir, fetchImpl, pause: async (ms) => pauses.push(ms) });
    assert.deepEqual(first.counts, { countries: 1, fetched: 1, cached: 0, failed: 0 });
    assert.ok(pauses.includes(30_000), 'backs off after a challenge page');
    assert.equal(read(join(dir, 'poland.json')).data.public.code, 'PL');
    assert.ok(read(join(dir, 'poland.json')).fetchedAt);
    assert.ok(read(join(dir, '_guide.json')).data);

    urls.length = 0;
    const second = await runPlonkit({ dir, fetchImpl, pause: noPause });
    assert.deepEqual(second.counts, { countries: 1, fetched: 0, cached: 1, failed: 0 });
    assert.deepEqual(urls, ['https://www.plonkit.net/guide']);
  });

  it('stops at the deadline and falls back to the cached guide', async () => {
    const dir = temp('plonkit-');
    writeFileSync(join(dir, '_guide.json'), JSON.stringify({ data: [{ title: 'Poland', slug: 'poland', code: 'PL' }] }));
    const fetchImpl = async () => response('blocked', { status: 403 });
    const result = await runPlonkit({ dir, fetchImpl, pause: noPause, deadline: Date.now() - 1 });
    assert.equal(result.budgetHit, true);
    assert.match(result.errors[0], /using the cached guide/);
  });
});

describe('learnablemeta', () => {
  const data = JSON.parse(readFileSync(new URL('fixtures/learnablemeta/map-data.json', import.meta.url), 'utf8'));

  it('unflattens the devalue data of the node with the meta list', () => {
    const map = parseMapData(data);
    assert.equal(map.mapName, 'Europe metas');
    assert.deepEqual(map.authors, ['Some Author']);
    assert.deepEqual(map.metas[0], {
      id: 101,
      name: 'Poland - Bollard',
      note: map.metas[0].note,
      images: ['https://learnablemeta.com/images/pl-bollard.avif'],
      locationsCount: 20,
      footer: map.metas[0].footer,
    });
    assert.match(map.metas[0].footer, /plonkit\.net\/poland/);
    assert.equal(map.metas.length, 4);
    assert.throws(() => parseMapData({ type: 'data', nodes: [null] }), /metaList/);
  });

  it('reads the maps list defensively', () => {
    const list = [{ name: 'B', geoguessrId: 'b2', regions: ['Europe'] }, { name: 'A', geoguessrId: 'a1' }, { name: 'no id' }, { geoguessrId: 'a1' }];
    assert.deepEqual(mapsOf(list), [{ geoguessrId: 'a1', name: 'A' }, { geoguessrId: 'b2', name: 'B', regions: ['Europe'] }]);
    assert.deepEqual(mapsOf({ maps: list }).length, 2);
  });

  it('caches the list and each map, skipping cached maps', async (t) => {
    const dir = temp('lm-');
    const fetchMock = t.mock.method(globalThis, 'fetch', async (url) =>
      url.endsWith('/api/maps/') ? response([{ name: 'Europe', geoguessrId: 'abc' }]) : response(data),
    );
    const first = await runLearnableMeta({ dir, pause: noPause });
    assert.deepEqual(first.counts, { maps: 1, fetched: 1, cached: 0, failed: 0 });
    assert.equal(fetchMock.mock.calls[1].arguments[0], 'https://learnablemeta.com/maps/abc/__data.json');
    const stored = read(join(dir, 'abc.json'));
    assert.equal(stored.geoguessrId, 'abc');
    assert.equal(stored.metas.length, 4);
    assert.deepEqual(read(join(dir, 'maps.json')), [{ geoguessrId: 'abc', name: 'Europe' }]);
    const second = await runLearnableMeta({ dir, pause: noPause });
    assert.equal(second.counts.cached, 1);
  });
});

describe('links', () => {
  const POLAND = 'https://www.google.com/maps/@48.4892755,22.8226335,3a,15y,293.62h,67.76t/data=!3m6!1e1!3m4!1sSZfQwOcH5qCjpxAWOGmgIg!2e0!7i13312!8i6656';

  it('parses Street View URLs', () => {
    assert.deepEqual(parseMapsUrl(POLAND), { pano: 'SZfQwOcH5qCjpxAWOGmgIg', lat: 48.4892755, lng: 22.8226335, heading: 293.62, pitch: -22.24, fov: 15 });
    assert.deepEqual(parseMapsUrl('https://www.google.se/maps/@47.17,18.80,3a,75y/data=!3m6!1e1'), { lat: 47.17, lng: 18.8, heading: 0, pitch: 0, fov: 75 });
    assert.deepEqual(
      parseMapsUrl('https://www.google.com/maps/@?api=1&map_action=pano&pano=_Q0TbU2ITVURhxCovhmDpA&viewpoint=60.230701,19.989345&heading=351.17579232999225&pitch=-4.5&fov=80'),
      { pano: '_Q0TbU2ITVURhxCovhmDpA', lat: 60.230701, lng: 19.989345, heading: 351.18, pitch: -4.5, fov: 80 },
    );
    const photosphere = parseMapsUrl('https://www.google.com/maps/@1.5,2.5,3a,75y,10h,90t/data=!3m8!1e1!3m6!1sAF1QipMabcdefghijklmnop!2e10');
    assert.equal(photosphere.pano, undefined);
    assert.equal(photosphere.lat, 1.5);
    assert.equal(parseMapsUrl('https://www.google.com/maps/place/Krak%C3%B3w/@50.04,19.94,12z'), undefined);
    assert.equal(parseMapsUrl('https://www.google.com/maps/@50.04,19.94%2C3a%2C75y%2C90h%2C100t').pitch, 10);
  });

  it('tells Google Maps links apart', () => {
    for (const url of [POLAND, 'https://goo.gl/maps/JLqgxCCLwZPCWaBc6', 'https://maps.app.goo.gl/wvnHofq3MFz4x8cm8', 'http://google.com/maps/@1,2,3a']) assert.ok(isMapsLink(url), url);
    for (const url of ['/images/poland/x.png', 'https://upload.wikimedia.org/x.png', undefined, '#']) assert.ok(!isMapsLink(url), url);
  });

  it('follows redirects by hand until a Street View URL', async () => {
    const hops = {
      'https://goo.gl/maps/a': 'https://maps.app.goo.gl/a',
      'https://maps.app.goo.gl/a': `https://consent.google.com/ml?continue=${encodeURIComponent(POLAND)}`,
    };
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push([url, init.redirect]);
      return hops[url] ? new Response(null, { status: 302, headers: { location: hops[url] } }) : new Response('', { status: 404 });
    };
    assert.deepEqual(await resolveLink('https://goo.gl/maps/a', { fetchImpl }), { url: POLAND });
    assert.deepEqual(seen, [['https://goo.gl/maps/a', 'manual'], ['https://maps.app.goo.gl/a', 'manual']]);
    assert.deepEqual(await resolveLink('https://goo.gl/maps/gone', { fetchImpl }), { error: 'HTTP 404' });
    await assert.rejects(resolveLink('https://goo.gl/maps/x', { fetchImpl: async () => new Response('', { status: 429 }) }), /429/);
  });

  it('resolves only uncached short links and saves the cache', async () => {
    const dir = temp('links-');
    const path = join(dir, 'links.json');
    const item = (id, imageLink) => ({ kind: 'tip', id, data: { image: { imageUrl: '/i.png', imageLink }, text: ['x'] } });
    writeFileSync(join(dir, 'poland.json'), JSON.stringify({ data: { public: { steps: [{ kind: 'tip', items: [
      item('a', 'https://goo.gl/maps/new'),
      item('b', 'https://goo.gl/maps/known'),
      item('c', POLAND),
      item('d', '/images/x.png'),
    ] }] } } }));
    writeFileSync(path, JSON.stringify({ 'https://goo.gl/maps/known': { url: POLAND } }));
    assert.deepEqual(plonkitImageLinks(dir), ['https://goo.gl/maps/known', 'https://goo.gl/maps/new', POLAND]);
    const fetchImpl = async () => new Response(null, { status: 301, headers: { location: POLAND } });
    const result = await runLinks({ dir, path, fetchImpl, pause: noPause });
    assert.deepEqual(result.counts, { todo: 1, resolved: 1, gone: 0, failed: 0, left: 0 });
    assert.deepEqual(Object.keys(read(path)), ['https://goo.gl/maps/known', 'https://goo.gl/maps/new']);
    const again = await runLinks({ dir, path, fetchImpl: async () => assert.fail('no request'), pause: noPause });
    assert.equal(again.counts.todo, 0);
  });
});

describe('clueimages', () => {
  it('copies images without a path as webp and records path and size', async (t) => {
    const dir = temp('clueimages-');
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#c33' } }).png().toBuffer();
    const clue = (id, images) => ({ id, images });
    writeFileSync(join(dir, 'pl.json'), JSON.stringify({ country: 'PL', clues: [
      clue('pl-a', [{ id: 'aaa', src: 'https://www.plonkit.net/a.png' }, { id: 'old', src: 'https://www.plonkit.net/o.png', path: 'pl/old.webp' }]),
      clue('pl-b', [{ id: 'aaa', src: 'https://www.plonkit.net/a.png' }, { id: 'bad', src: 'https://www.plonkit.net/missing.png' }]),
    ] }));
    writeFileSync(join(dir, 'index.json'), '[]');
    t.mock.method(globalThis, 'fetch', async (url) => (url.endsWith('missing.png') ? new Response('nope', { status: 404 }) : new Response(png)));
    const uploads = [];
    const storage = { upload: async (path, body) => uploads.push([path, (await sharp(body).metadata()).format]) };
    const result = await runClueImages({ storage, dir, pause: noPause });
    assert.deepEqual(result.counts, { copied: 2, already: 1, failed: 1 });
    assert.match(result.errors[0], /^pl\/bad .*404/);
    assert.deepEqual(uploads, [['pl/aaa.webp', 'webp']]);
    const [a, b] = read(join(dir, 'pl.json')).clues;
    assert.deepEqual(a.images[0], { id: 'aaa', src: 'https://www.plonkit.net/a.png', path: 'pl/aaa.webp', width: 1280, height: 640 });
    assert.equal(b.images[0].path, 'pl/aaa.webp');
    assert.equal(b.images[1].path, undefined);
  });
});

describe('wipemedia', () => {
  it('lists the bucket through its folders and deletes in batches of 100', async (t) => {
    const files = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `${i}.webp` }));
    const listing = { '': [{ id: null, name: 'approved' }, { id: null, name: 'candidates' }, { id: 'r', name: 'stray.webp' }], approved: files('a', 3), candidates: files('c', 150) };
    const deletes = [];
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      const body = JSON.parse(init.body);
      if (url.endsWith('/object/list/media')) return response(listing[body.prefix].slice(body.offset, body.offset + body.limit));
      if (init.method === 'DELETE') {
        deletes.push(body.prefixes.length);
        return response(body.prefixes.map((name) => ({ name })));
      }
      return response('{}', { status: 500 });
    });
    const storage = createStorage({ url: 'https://x.supabase.co', key: 'k' });
    const result = await wipeMedia({ storage });
    assert.deepEqual(result.counts, { listed: 154, removed: 154, approved: 3, candidates: 150, '(root)': 1 });
    assert.deepEqual(deletes, [100, 54]);
  });
});
