// GeoHints as a clue source: country names, labels, one clue per country and category, sameAs, SVGs.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { runClueImages } from '../clueimages.mjs';
import { buildClues, countryLookup } from '../clues.mjs';
import { CATEGORIES, buildGeoHints, geohintsCountry, geohintsImageLinks, itemCaption, loadGeoHints, readLabels } from '../geohints.mjs';
import { isSvg, rasteriseSvg } from '../images.mjs';
import { loadPool, mediaId } from '../lib/common.mjs';

const pool = loadPool();
const poolCodes = new Set(pool.map((c) => c.code));
const lookup = countryLookup(pool);
const category = (path) => CATEGORIES.find((c) => c.path === path);
const IMG = 'https://x.geohints.com/storage';
const POLAND = 'https://www.google.com/maps/@52.1,21.0,3a,75y,90h,90t/data=!3m6!1e1!3m4!1sAAAAAAAAAAAAAAAAAAAAAA!2e0';

const temp = (prefix) => mkdtempSync(join(tmpdir(), prefix));
/** A GeoHints cache folder from data.json categories and signs.json categories. */
function sources({ data = {}, signs = {} } = {}) {
  const dir = temp('geohints-');
  const cats = Object.fromEntries(Object.entries(data).map(([k, items]) => [`/meta/${k}`, { title: k, items }]));
  writeFileSync(join(dir, 'data.json'), JSON.stringify({ source: 'https://geohints.com', fetchedAt: '2026-11-10T00:00:00.000Z', cats }));
  writeFileSync(join(dir, 'signs.json'), JSON.stringify({ fetchedAt: '2026-11-10T00:00:00.000Z', cats: Object.fromEntries(Object.entries(signs).map(([k, v]) => [`/meta/signs/${k}`, v])) }));
  return dir;
}

describe('geohintsCountry', () => {
  it('maps GeoHints spellings to pool codes', () => {
    const code = (name) => geohintsCountry(name, lookup, poolCodes)?.code;
    assert.equal(code('Czech Republic'), 'CZ');
    assert.equal(code('Macao'), 'MO');
    assert.equal(code('United States Virgin Islands'), 'VI');
    assert.equal(code('Svalbard and Jan Mayen'), 'SJ');
    assert.equal(code('Türkiye'), 'TR');
    assert.equal(code('Paraguay'), 'PY');
    assert.deepEqual(geohintsCountry('Åland', lookup, poolCodes), { code: 'FI', region: 'Åland' });
    assert.equal(code('Palestine'), undefined);
    assert.equal(code('United States Minor Outlying Islands'), undefined);
  });
});

describe('readLabels', () => {
  it('sorts camera tags, regions, sign values and notes by layout', () => {
    assert.deepEqual(readLabels(category('googleVehicles/cars'), ['Gen 3', 'Antenna', 'Alaska']), { labels: [], regions: ['Alaska'], notes: [], tags: ['Gen 3', 'Antenna'] });
    assert.deepEqual(readLabels(category('licensePlates'), ['Alaska\n      ‌', 'Car', '2012 - Present']).regions, ['Alaska']);
    assert.deepEqual(readLabels(category('licensePlates'), ['‌', 'Car']), { labels: ['Car'], regions: [], notes: [], tags: [] });
    assert.deepEqual(readLabels(category('signs/speed'), ['30', 'Ontario']), { labels: ['30'], regions: ['Ontario'], notes: [], tags: [] });
    assert.deepEqual(readLabels(category('bollards'), ['Nevada, Utah, Wyoming, Colorado, Idaho']).regions, ['Nevada, Utah, Wyoming, Colorado, Idaho']);
    assert.deepEqual(readLabels(category('bollards'), ['Buy']), { labels: [], regions: [], notes: [], tags: [] });
    assert.deepEqual(readLabels(category('signs/stop'), ['Old (1957–1971)']).labels, ['Old (1957–1971)']);
    const isRegion = (l) => l === 'Vorarlberg';
    const architecture = readLabels(category('architecture'), ['These round shingles are typical for Vorarlberg, rarely found western part of Tyrol.', 'Vorarlberg'], isRegion);
    assert.deepEqual(architecture.regions, ['Vorarlberg']);
    assert.equal(architecture.notes.length, 1);
    assert.deepEqual(readLabels(category('nature'), ['Papaya (Carica papaya)', 'Invasive. Due to the acidity of the soil the f\nlowers are blue.']).notes, ['Invasive. Due to the acidity of the soil the flowers are blue.']);
  });

  it('captions items, SVG drawings as sign designs', () => {
    const car = readLabels(category('googleVehicles/cars'), ['Gen 3', 'Antenna', 'Alaska']);
    assert.equal(itemCaption(category('googleVehicles/cars'), car, `${IMG}/car.jpg`), 'Gen 3 car (antenna), Alaska');
    const speed = readLabels(category('signs/speed'), ['30']);
    assert.equal(itemCaption(category('signs/speed'), speed, `${IMG}/s.jpg`), 'Speed limit 30');
    assert.equal(itemCaption(category('signs/speed'), speed, `${IMG}/s.svg`), 'Sign design: speed limit 30');
    assert.equal(itemCaption(category('signs/stop'), readLabels(category('signs/stop'), []), `${IMG}/stop.svg`), 'Sign design: stop sign');
  });
});

describe('GeoHints clues', () => {
  const dir = sources({
    data: {
      bollards: [
        { t: ['Poland'], img: `${IMG}/bollards/1.jpg`, maps: 'https://goo.gl/maps/pl1' },
        { t: ['Poland'], img: `${IMG}/bollards/1.jpg`, maps: 'https://goo.gl/maps/pl1' },
        { t: ['Poland', 'Buy'], img: `${IMG}/bollards/2.jpg`, maps: POLAND },
        { t: ['Paraguay'], img: `${IMG}/bollards/3.jpg`, maps: null },
        { t: ['Palestine'], img: `${IMG}/bollards/4.jpg`, maps: null },
        { t: [], img: `${IMG}//logos/logo.svg`, maps: null },
      ],
      'googleVehicles/cars': [{ t: ['United States', 'Gen 3', 'Alaska'], img: `${IMG}/car_1.jpg`, maps: null }, { t: ['United States', 'Gen 4', 'Alaska'], img: `${IMG}/car_2.jpg`, maps: null }],
      companies: [{ t: ['Poland'], img: `${IMG}/beer.svg`, maps: null }],
    },
    signs: {
      stop: [
        { country: null, img: `${IMG}//logos/logo.svg`, maps: null, t: [] },
        { country: 'Czech Republic', img: `${IMG}/signs_1.svg`, maps: 'https://maps.app.goo.gl/cz1', t: [] },
        { country: 'Slovakia', img: `${IMG}/signs_1.svg`, maps: 'https://maps.app.goo.gl/sk1', t: [] },
        { country: 'Slovakia', img: `${IMG}/signs_2.jpg`, maps: null, t: [] },
      ],
      speed: [{ country: 'Poland', img: `${IMG}/s50.svg`, maps: null, t: ['50'] }, { country: 'Poland', img: `${IMG}/s90.svg`, maps: null, t: ['90'] }],
    },
  });
  const geohints = loadGeoHints(dir);
  const links = { 'https://goo.gl/maps/pl1': { url: POLAND } };
  const { countries, geohintsUnmatched, counts } = buildClues({ pages: [], maps: [], links, geohints }, { pool });
  const clue = (code, id) => countries.find((c) => c.country === code)?.clues.find((c) => c.id === id);

  it('reads only the used categories, without the site logo', () => {
    assert.ok(geohints.items.every((i) => !i.img.endsWith('logo.svg') && i.category.path !== 'companies'));
    assert.deepEqual(geohintsImageLinks(dir), ['https://goo.gl/maps/pl1', 'https://maps.app.goo.gl/cz1', 'https://maps.app.goo.gl/sk1', POLAND]);
  });

  it('makes one clue per country and category with stable ids, a step of its own and credit', () => {
    assert.deepEqual(countries.map((c) => c.country), ['CZ', 'PL', 'PY', 'SK', 'US']);
    const pl = countries.find((c) => c.country === 'PL');
    assert.deepEqual(pl.steps, [{ title: 'More from GeoHints' }]);
    assert.deepEqual(pl.clues.map((c) => [c.id, c.step, c.order, c.family, c.kind]), [
      ['pl-gh-bollards', 0, 0, 'bollard', undefined],
      ['pl-gh-signs-speed', 0, 1, 'sign', 'speed'],
    ]);
    const bollards = clue('PL', 'pl-gh-bollards');
    assert.deepEqual(bollards.credit, { source: 'GeoHints', url: 'https://geohints.com/meta/bollards', licence: 'GeoHints; used with credit for personal study' });
    assert.equal(bollards.title, 'Bollard: more examples');
    assert.deepEqual(bollards.images.map((i) => i.id), [mediaId(`${IMG}/bollards/1.jpg`), mediaId(`${IMG}/bollards/2.jpg`)], 'repeats of a src dropped');
    assert.ok(bollards.images.every((i) => i.role === 'example' && i.caption === 'Bollard'));
    assert.equal(bollards.images[0].location.pano, 'AAAAAAAAAAAAAAAAAAAAAA');
    assert.equal(bollards.images[0].location.source, 'saved');
    assert.equal(bollards.locations.length, 1, 'both images are the same spot');
    assert.equal(clue('PL', 'pl-gh-signs-speed').summary, 'Speed limit signs seen here: 50, 90.');
    assert.equal(clue('US', 'us-gh-googlevehicles-cars').region, 'Alaska');
    assert.ok(clue('PY', 'py-gh-bollards'), 'a country without a Plonk It page still gets a file');
    assert.equal(countries.find((c) => c.country === 'PY').sourceUrl, 'https://geohints.com');
    assert.deepEqual(geohintsUnmatched, { Palestine: 1 });
    assert.equal(counts.geohintsAdded, 6);
    const again = buildClues({ pages: [], maps: [], links, geohints: loadGeoHints(dir) }, { pool });
    assert.deepEqual(again.countries, countries);
  });

  it('marks countries sharing a sign image in sameAs, each keeping its copy', () => {
    assert.deepEqual(clue('CZ', 'cz-gh-signs-stop').sameAs, ['SK']);
    assert.deepEqual(clue('SK', 'sk-gh-signs-stop').sameAs, ['CZ']);
    assert.equal(clue('SK', 'sk-gh-signs-stop').images.length, 2);
    assert.equal(clue('PL', 'pl-gh-bollards').sameAs, undefined);
    assert.equal(clue('CZ', 'cz-gh-signs-stop').images[0].caption, 'Sign design: stop sign');
  });

  it('comes after the Plonk It steps of a country', () => {
    const poland = JSON.parse(readFileSync(new URL('fixtures/plonkit/poland.json', import.meta.url), 'utf8'));
    const pl = buildClues({ pages: [poland], maps: [], links, geohints }, { pool }).countries.find((c) => c.country === 'PL');
    assert.equal(pl.steps.at(-1).title, 'More from GeoHints');
    assert.ok(pl.clues.filter((c) => c.credit.source === 'GeoHints').every((c) => c.step === pl.steps.length - 1));
    assert.equal(pl.sourceUrl, 'https://www.plonkit.net/poland');
  });

  it('only builds the countries asked for', () => {
    assert.deepEqual(buildClues({ pages: [], maps: [], links, geohints }, { pool, only: ['SK'] }).countries.map((c) => c.country), ['SK']);
  });

  it('leaves sameAs out when no image is shared (unit)', () => {
    const items = [{ category: category('signs/yield'), country: 'Poland', t: [], img: `${IMG}/y.svg` }];
    const { clues } = buildGeoHints({ items }, { lookup, poolCodes });
    assert.equal(clues.get('PL')[0].sameAs, undefined);
    assert.equal(clues.get('PL')[0].kind, 'giveway');
  });
});

describe('SVG sign designs', () => {
  const svg = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="80" height="48"><rect x="10" y="10" width="20" height="20" fill="red"/></svg>');

  it('recognises SVG markup', () => {
    assert.ok(isSvg(svg));
    assert.ok(isSvg(Buffer.from('<svg viewBox="0 0 10 10"></svg>')));
    assert.ok(!isSvg(Buffer.from([0xff, 0xd8, 0xff, 0xe0])));
  });

  it('rasterises at 1024 px wide on white', async () => {
    const png = await rasteriseSvg(svg, 1024);
    const { width, height, format, hasAlpha } = await sharp(png).metadata();
    assert.deepEqual([width, height, format, hasAlpha], [1024, 614, 'png', false]);
    const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([...data.subarray(0, 3)], [255, 255, 255], 'transparent corner is white');
  });

  it('clueimages copies an SVG as a 1024 px webp', async (t) => {
    const dir = temp('clueimages-svg-');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pl.json'), JSON.stringify({ country: 'PL', clues: [{ id: 'pl-gh-signs-stop', images: [{ id: 'abc', src: `${IMG}/signs_1.svg` }] }] }));
    t.mock.method(globalThis, 'fetch', async () => new Response(svg));
    const uploads = [];
    const storage = { upload: async (path, body) => uploads.push([path, (await sharp(body).metadata()).width]) };
    const result = await runClueImages({ storage, dir, pause: async () => {} });
    assert.deepEqual(result.counts, { copied: 1, already: 0, failed: 0 });
    assert.deepEqual(uploads, [['pl/abc.webp', 1024]]);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'pl.json'), 'utf8')).clues[0].images[0], { id: 'abc', src: `${IMG}/signs_1.svg`, path: 'pl/abc.webp', width: 1024, height: 614 });
  });
});
