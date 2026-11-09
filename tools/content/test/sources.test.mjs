// Parsing and transform tests against hand-written fixtures in the APIs' documented shapes.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { categoriesFor, existingTitles, findCandidates as findCommons, licenceOk, parseFilePage } from '../commons.mjs';
import { toMediaItem } from '../collect.mjs';
import { contains, haversineKm, mediaId, randomPointsIn, stripHtml } from '../lib/common.mjs';
import { bboxAround, boxCandidates, createGraph, findCandidates as findMapillary, parseImage, spaceOut } from '../mapillary.mjs';
import { createStorage } from '../storage.mjs';
import { createQueue, MISSING_TABLE, toRow } from '../queue.mjs';
import { buildQuery, mergeFacts, parseResults } from '../wikidata.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8'));
const poland = { code: 'PL', name: 'Poland', continent: 'europe', in_pool: true };

describe('wikidata', () => {
  const parsed = parseResults(fixture('wikidata-sparql.json'));

  it('collapses SPARQL rows into one entry per country', () => {
    assert.deepEqual(parsed.pl, {
      wikidata: 'Q36',
      drivingSide: 'right',
      tld: ['.pl'],
      callingCode: ['+48'],
      languages: ['Polish'],
      scripts: ['Latin script', 'Polish alphabet'],
    });
    assert.equal(parsed.gb.drivingSide, 'left');
  });

  it('limits the query to sovereign states and territories', () => {
    assert.match(buildQuery(['pl']), /wdt:P31 \?kind[\s\S]*VALUES \?kind \{ wd:Q3624078 wd:Q161243 wd:Q1048835 \}/);
  });

  it('picks one item per ISO code, preferring one with a driving side or TLD', () => {
    const row = (item, extra = {}) => ({
      code: { value: 'FR' },
      item: { value: `http://www.wikidata.org/entity/${item}` },
      ...extra,
    });
    const json = {
      results: {
        bindings: [
          row('Q1', { langLabel: { value: 'Old French' } }),
          row('Q142', { sideLabel: { value: 'right-hand traffic' }, langLabel: { value: 'French' } }),
          row('Q9', { langLabel: { value: 'Other' } }),
        ],
      },
    };
    assert.deepEqual(parseResults(json).fr, {
      wikidata: 'Q142',
      drivingSide: 'right',
      tld: [],
      callingCode: [],
      languages: ['French'],
      scripts: [],
    });
    const none = { results: { bindings: [row('Q9'), row('Q2')] } };
    assert.equal(parseResults(none).fr.wikidata, 'Q2', 'otherwise the lowest Q number');
  });

  it('leaves the driving side out when Wikidata lists both', () => {
    assert.equal(parsed.se.drivingSide, undefined);
    assert.deepEqual(parsed.se.tld, ['.se']);
  });

  it('only fills missing fields and never touches notes or hand-set values', () => {
    const note = { id: 'pl:x', subject: 'bollard', text: 't', source: 'https://a.b', checked: '2026-11-09', verified: true };
    const existing = { code: 'pl', name: 'Poland', drivingSide: 'left', tld: [], extra: 1, notes: [note] };
    const { facts, added } = mergeFacts(existing, parsed.pl, poland);
    assert.equal(facts.drivingSide, 'left');
    assert.deepEqual(facts.tld, [], 'an existing (even empty) value is hand-set');
    assert.deepEqual(facts.callingCode, ['+48']);
    assert.deepEqual(facts.notes, [note]);
    assert.equal(facts.extra, 1);
    assert.deepEqual(added, ['wikidata', 'callingCode', 'languages', 'scripts']);
    assert.deepEqual(Object.keys(facts).at(-1), 'notes');
  });

  it('creates a new facts file with empty notes', () => {
    const { facts } = mergeFacts(undefined, parsed.pl, poland);
    assert.equal(facts.code, 'pl');
    assert.deepEqual(facts.notes, []);
  });
});

describe('commons', () => {
  it('builds category names, trying "the" and Commons spellings', () => {
    assert.deepEqual(categoriesFor('plate', 'Poland'), [
      'Category:License plates of Poland',
      'Category:License plates of the Poland',
      'Category:Vehicle registration plates of Poland',
      'Category:Vehicle registration plates of the Poland',
    ]);
    assert.ok(categoriesFor('sign', 'Czechia').includes('Category:Road signs in the Czech Republic'));
    assert.deepEqual(categoriesFor('car', 'Poland'), []);
  });

  it('skips categories that are missing', () => {
    assert.deepEqual(existingTitles(fixture('commons-categoryinfo.json')), ['Category:Utility poles in Poland']);
  });

  it('keeps large, freely licensed photos and says why others are dropped', () => {
    const pages = fixture('commons-files.json').query.pages;
    const results = pages.map((p) => parseFilePage(p, { country: 'pl', subject: 'pole' }));
    assert.deepEqual(results[0], {
      id: 'b2893283ea8b',
      country: 'pl',
      subject: 'pole',
      source: 'commons',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Concrete_pole_near_Kielce.jpg',
      downloadUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Concrete_pole_near_Kielce.jpg/1280px-Concrete_pole_near_Kielce.jpg',
      credit: 'Ana Ruiz · Wikimedia Commons · CC BY-SA 4.0',
      licence: 'CC BY-SA 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      title: 'Concrete pole near Kielce.jpg',
      description: 'Concrete utility pole with holes',
    });
    assert.equal(results[0].caption, undefined, 'a Commons description is never a caption');
    assert.deepEqual(results.slice(1, 5), ['too small', 'type image/svg+xml', 'logo', 'licence GFDL']);
    assert.equal(results[5].credit, 'Unknown author · Wikimedia Commons · Public domain');
  });

  it('waits for a page\'s imageinfo instead of marking a bare continuation page as seen', async (t) => {
    const file = fixture('commons-files.json').query.pages[0];
    let filePages = 0;
    t.mock.method(globalThis, 'fetch', async (url) => {
      const q = new URL(url).searchParams;
      const body = (json) => new Response(JSON.stringify(json));
      if (q.get('prop') === 'categoryinfo') return body({ query: { pages: [{ title: 'Category:Utility poles in Poland' }] } });
      if (q.get('list') === 'categorymembers') return body({ query: { categorymembers: [] } });
      filePages++;
      if (filePages === 1) return body({ continue: { gcmcontinue: 'x' }, query: { pages: [{ pageid: file.pageid, title: file.title }] } });
      return body({ query: { pages: [file] } });
    });
    const { candidates } = await findCommons('pl', 'pole', 5);
    assert.equal(candidates.length, 1);
  });

  it('derives photo ids from the source URL alone, with no country in them', () => {
    assert.match(mediaId('https://commons.wikimedia.org/wiki/File:A.jpg'), /^[0-9a-f]{12}$/);
    assert.equal(mediaId('https://x/1'), mediaId('https://x/1'));
    assert.notEqual(mediaId('https://x/1'), mediaId('https://x/2'));
  });

  it('allows SVGs for signs only', () => {
    const svg = fixture('commons-files.json').query.pages[2];
    assert.equal(typeof parseFilePage(svg, { country: 'pl', subject: 'sign' }), 'object');
  });

  it('accepts CC0, PD, CC BY and CC BY-SA only', () => {
    for (const ok of ['CC0', 'Public domain', 'PD-self', 'CC BY 2.0', 'CC BY-SA 3.0 de']) assert.ok(licenceOk(ok), ok);
    for (const bad of ['GFDL', 'CC BY-NC 2.0', 'Copyrighted', '', undefined]) assert.ok(!licenceOk(bad), String(bad));
  });

  it('strips HTML from artist fields', () => {
    assert.equal(stripHtml('<span>A &amp; B</span>\n<i>x</i>'), 'A & B x');
  });
});

describe('mapillary', () => {
  it('uses boxes under the 0.01 deg² limit', () => {
    const [x0, y0, x1, y1] = bboxAround([19.94, 50.06]);
    assert.ok((x1 - x0) * (y1 - y0) < 0.01);
  });

  it('parses images, skipping panoramas, with credit and a stable id', () => {
    const [first, pano, third] = fixture('mapillary-images.json').data.map((i) => parseImage(i, { country: 'pl', subject: 'bollard' }));
    assert.equal(pano, null);
    assert.deepEqual(
      { id: first.id, credit: first.credit, licence: first.licence, sourceUrl: first.sourceUrl, lon: first.lon, lat: first.lat },
      {
        id: '1bb56c4b5cb2',
        credit: 'roadmapper · Mapillary · CC BY-SA 4.0',
        licence: 'CC BY-SA 4.0',
        sourceUrl: 'https://www.mapillary.com/app/?pKey=498763468214164',
        lon: 19.9449,
        lat: 50.0647,
      },
    );
    assert.deepEqual([third.lon, third.lat], [19.946, 50.066], 'falls back to the raw geometry');
  });

  it('spaces photos at least 10 km apart, at most 3 per box', () => {
    const at = (lon, box) => ({ lon, lat: 50, box });
    const kept = spaceOut([at(19, 'a'), at(19.01, 'a'), at(19.2, 'a'), at(19.4, 'a'), at(19.6, 'a'), at(19.8, 'b')], [at(18, 'z')]);
    assert.deepEqual(kept.map((c) => c.lon), [19, 19.2, 19.4, 19.8]);
    assert.ok(haversineKm([19, 50], [19.2, 50]) > 10);
  });

  it('turns detected poles into pole photos, and falls back to roadside scenes as bollards', async () => {
    const image = { ...fixture('mapillary-images.json').data[0], id: '771111111111111' };
    const graph = {
      poles: async () => fixture('mapillary-map-features.json'),
      featureImages: async (id) => (id === '3009387919309012' ? fixture('mapillary-feature-images.json').images.data.map((i) => i.id) : []),
      image: async (id) => ({ ...image, id }),
      images: async () => fixture('mapillary-images.json'),
    };
    const poles = await boxCandidates(graph, bboxAround([21, 52.2]), 'pl', 'pole');
    assert.deepEqual(poles.map((c) => [c.id, c.subject]), [['48678992e75b', 'pole']]);
    const none = await boxCandidates({ ...graph, poles: async () => ({ data: [] }) }, bboxAround([21, 52.2]), 'pl', 'pole');
    assert.deepEqual(none.map((c) => c.subject), ['bollard', 'bollard']);
  });

  it('gives Graph calls a 15 s timeout and one retry', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('down', { status: 503 }));
    await assert.rejects(createGraph('token').image('1'), /HTTP 503/);
    assert.equal(fetch.mock.calls.length, 2);
  });

  it('stops sampling and reports budgetHit once the deadline has passed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ne-'));
    mkdirSync(join(dir, 'natural-earth'));
    const square = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
    writeFileSync(join(dir, 'natural-earth', 'ne_50m_admin_0_countries.geojson'), JSON.stringify({ features: [{ properties: { ISO_A2_EH: 'PL' }, geometry: square }] }));
    const was = process.env.RUNNER_TEMP;
    process.env.RUNNER_TEMP = dir;
    try {
      let calls = 0;
      const graph = { images: async () => (calls++, { data: [] }) };
      const late = await findMapillary('pl', 'bollard', 5, { graph, deadline: Date.now() - 1 });
      assert.deepEqual([late.budgetHit, calls], [true, 0]);
      const fine = await findMapillary('pl', 'bollard', 5, { graph, deadline: Date.now() + 60_000 });
      assert.equal(fine.budgetHit, undefined);
      assert.ok(calls > 0);
    } finally {
      if (was === undefined) delete process.env.RUNNER_TEMP;
      else process.env.RUNNER_TEMP = was;
    }
  });

  it('samples points inside the polygon only', () => {
    const square = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6], [0.4, 0.4]]] };
    const points = randomPointsIn(square, 50);
    assert.equal(points.length, 50);
    assert.ok(points.every((p) => contains(square, p)));
    assert.ok(!contains(square, [0.5, 0.5]), 'holes are outside');
  });
});

describe('queue', () => {
  const stubFetch = (status, body) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

  it('maps candidates to rows', () => {
    const row = toRow({ country: 'pl', subject: 'pole', source: 'commons', sourceUrl: 'https://x', storagePath: 'candidates/a.webp', width: 1280, height: 960, credit: 'c', licence: 'CC0', description: 'Pole in Poland' });
    assert.equal(row.source_url, 'https://x');
    assert.equal(row.storage_path, 'candidates/a.webp');
    assert.equal(row.description, 'Pole in Poland');
    assert.ok(!('caption' in row), 'the caption is the curator\'s to write');
    assert.equal(row.status, undefined, 'status keeps its default; re-runs never reset decisions');
  });

  it('says plainly which migration to run when the table is missing', async (t) => {
    t.mock.method(globalThis, 'fetch', stubFetch(404, fixture('postgrest-missing-table.json')));
    const queue = createQueue({ url: 'https://example.supabase.co', key: 'service' });
    await assert.rejects(queue.listApproved(), { message: MISSING_TABLE });
    assert.match(MISSING_TABLE, /run supabase\/migrations\/0003_media\.sql/);
  });

  it('sends sb_ secret keys as apikey only, and legacy JWT keys with a Bearer token too', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', stubFetch(200, '[]'));
    await createQueue({ url: 'https://example.supabase.co', key: 'sb_secret_abc' }).listApproved();
    await createQueue({ url: 'https://example.supabase.co', key: 'eyJ.legacy.jwt' }).listApproved();
    const [modern, legacy] = fetch.mock.calls.map((c) => c.arguments[1].headers);
    assert.equal(modern.apikey, 'sb_secret_abc');
    assert.equal(modern.Authorization, undefined);
    assert.equal(legacy.apikey, 'eyJ.legacy.jwt');
    assert.equal(legacy.Authorization, 'Bearer eyJ.legacy.jwt');
    const upload = t.mock.method(globalThis, 'fetch', stubFetch(200, ''));
    await createStorage({ url: 'https://example.supabase.co', key: 'sb_secret_abc' }).upload('candidates/a.webp', Buffer.from('x'));
    assert.deepEqual(Object.keys(upload.mock.calls[0].arguments[1].headers).filter((h) => /^(apikey|Authorization)$/.test(h)), ['apikey']);
  });

  it('pages through every known source_url, 1000 rows at a time', async (t) => {
    const urls = [];
    t.mock.method(globalThis, 'fetch', async (url) => {
      urls.push(String(url));
      const offset = Number(new URL(url).searchParams.get('offset'));
      const count = offset < 2000 ? 1000 : 5;
      return new Response(JSON.stringify(Array.from({ length: count }, (_, i) => ({ source_url: `https://src/${offset + i}` }))));
    });
    const known = await createQueue({ url: 'https://example.supabase.co', key: 'k' }).knownSourceUrls('pl');
    assert.equal(known.size, 2005);
    assert.deepEqual(urls.map((u) => new URL(u).searchParams.get('offset')), ['0', '1000', '2000']);
    assert.ok(urls.every((u) => new URL(u).searchParams.get('limit') === '1000'));
  });

  it('lists approved rows whether or not collected, a page at a time, and marks in batches', async (t) => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      calls.push({ url: new URL(url), init });
      const offset = Number(new URL(url).searchParams.get('offset'));
      return new Response(init?.method === 'PATCH' ? '' : JSON.stringify(Array.from({ length: offset ? 3 : 1000 }, (_, i) => ({ id: `r${offset + i}` }))));
    });
    const queue = createQueue({ url: 'https://example.supabase.co', key: 'k' });
    assert.equal((await queue.listApproved()).length, 1003);
    assert.ok(calls.every((c) => !c.url.searchParams.has('collected_at')));
    calls.length = 0;
    await queue.listApproved({ uncollected: true });
    assert.equal(calls[0].url.searchParams.get('collected_at'), 'is.null');
    calls.length = 0;
    await queue.markCollected(Array.from({ length: 150 }, (_, i) => `id${i}`), '2026-11-09T00:00:00Z');
    assert.equal(calls.length, 2);
    assert.match(calls[0].url.searchParams.get('id'), /^in\.\(id0,id1,.*id99\)$/);
    assert.deepEqual(JSON.parse(calls[1].init.body), { collected_at: '2026-11-09T00:00:00Z' });
  });

  it('upserts on source_url, ignoring duplicates', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', stubFetch(201, ''));
    await createQueue({ url: 'https://example.supabase.co/', key: 'service' }).insert([{ country: 'pl', sourceUrl: 'https://x' }]);
    const [url, init] = fetch.mock.calls[0].arguments;
    assert.equal(url, 'https://example.supabase.co/rest/v1/media_candidates?on_conflict=source_url');
    assert.match(init.headers.Prefer, /resolution=ignore-duplicates/);
    assert.equal(init.headers.apikey, 'service');
  });
});

describe('collect', () => {
  it('turns an approved row into a MediaItem under approved/', () => {
    const [row] = fixture('postgrest-approved.json');
    assert.deepEqual(toMediaItem(row), {
      id: 'b2893283ea8b',
      country: 'pl',
      subject: 'pole',
      noteId: 'pl:pole-holey',
      url: 'approved/b2893283ea8b.webp',
      width: 1280,
      height: 960,
      preview: 'data:image/webp;base64,UklGRg==',
      credit: 'Ana Ruiz · Wikimedia Commons · CC BY-SA 4.0',
      licence: 'CC BY-SA 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Concrete_pole_near_Kielce.jpg',
      caption: 'Concrete pole with round holes',
    });
  });
});
