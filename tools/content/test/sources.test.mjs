// Parsing and transform tests against hand-written fixtures in the APIs' documented shapes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { categoriesFor, existingTitles, licenceOk, parseFilePage } from '../commons.mjs';
import { toMediaItem } from '../collect.mjs';
import { contains, haversineKm, randomPointsIn, stripHtml } from '../lib/common.mjs';
import { bboxAround, boxCandidates, parseImage, spaceOut } from '../mapillary.mjs';
import { createQueue, MISSING_TABLE, toRow } from '../queue.mjs';
import { mergeFacts, parseResults } from '../wikidata.mjs';

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
      id: 'pl-c1001',
      country: 'pl',
      subject: 'pole',
      source: 'commons',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Concrete_pole_near_Kielce.jpg',
      downloadUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Concrete_pole_near_Kielce.jpg/1280px-Concrete_pole_near_Kielce.jpg',
      credit: 'Ana Ruiz · Wikimedia Commons · CC BY-SA 4.0',
      licence: 'CC BY-SA 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      title: 'Concrete pole near Kielce.jpg',
      caption: 'Concrete utility pole with holes',
    });
    assert.deepEqual(results.slice(1, 5), ['too small', 'type image/svg+xml', 'logo', 'licence GFDL']);
    assert.equal(results[5].credit, 'Unknown author · Wikimedia Commons · Public domain');
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
        id: 'pl-m498763468214164',
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
    assert.deepEqual(poles.map((c) => [c.id, c.subject]), [['pl-m771111111111111', 'pole']]);
    const none = await boxCandidates({ ...graph, poles: async () => ({ data: [] }) }, bboxAround([21, 52.2]), 'pl', 'pole');
    assert.deepEqual(none.map((c) => c.subject), ['bollard', 'bollard']);
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
    const row = toRow({ country: 'pl', subject: 'pole', source: 'commons', sourceUrl: 'https://x', storagePath: 'candidates/pl/a.webp', width: 1280, height: 960, credit: 'c', licence: 'CC0' });
    assert.equal(row.source_url, 'https://x');
    assert.equal(row.storage_path, 'candidates/pl/a.webp');
    assert.equal(row.status, undefined, 'status keeps its default; re-runs never reset decisions');
  });

  it('says plainly which migration to run when the table is missing', async (t) => {
    t.mock.method(globalThis, 'fetch', stubFetch(404, fixture('postgrest-missing-table.json')));
    const queue = createQueue({ url: 'https://example.supabase.co', key: 'service' });
    await assert.rejects(queue.listApproved(), { message: MISSING_TABLE });
    assert.match(MISSING_TABLE, /run supabase\/migrations\/0003_media\.sql/);
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
      id: 'pl-c1001',
      country: 'pl',
      subject: 'pole',
      noteId: 'pl:pole-holey',
      url: 'approved/pl/pl-c1001.webp',
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
