import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { mediaId } from '../lib/common.mjs';
import { bigCities, nearCity, parsePano, pixelToLonLat, renderView, runPanoviews, viewCandidate, viewQuality, wrap360 } from '../panoviews.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8'));
const near = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps, `${actual} ≉ ${expected}`);

/** Synthetic equirectangular panorama: `color(lonRel, lat, u, v)` → [r, g, b] per pixel centre. */
function equirect(width, height, color) {
  const data = Buffer.alloc(width * height * 3);
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const lon = ((u + 0.5) / width) * 360 - 180;
      const lat = 90 - ((v + 0.5) / height) * 180;
      data.set(color(lon, lat, u, v), (v * width + u) * 3);
    }
  }
  return { data, width, height, channels: 3 };
}

const px = (rgb, width, x, y) => [...rgb.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)];

const RED = [220, 30, 30];
const GREEN = [30, 200, 30];
const BLUE = [30, 30, 220];
const YELLOW = [220, 220, 30];
/** relative longitude quadrants: [-180,-90) red, [-90,0) green, [0,90) blue, [90,180) yellow */
const quadrants = equirect(720, 360, (lon) => (lon < -90 ? RED : lon < 0 ? GREEN : lon < 90 ? BLUE : YELLOW));
const small = { width: 64, height: 48 };

describe('panoviews gnomonic mapping', () => {
  it('maps view pixels to directions: centre, 30° right, pitch, top edge', () => {
    const view = { width: 1024, height: 768, hfov: 75, pitch: 0 };
    const f = 512 / Math.tan(37.5 * (Math.PI / 180));
    assert.deepEqual(pixelToLonLat(512, 384, view), [0, 0]);
    const [lon30, lat30] = pixelToLonLat(512 + f * Math.tan(Math.PI / 6), 384, view);
    near(lon30, 30);
    near(lat30, 0);
    near(pixelToLonLat(0, 384, view)[0], -37.5);
    near(pixelToLonLat(512, 384, { ...view, pitch: -8 })[1], -8);
    near(pixelToLonLat(512, 0, view)[1], Math.atan(384 / f) * (180 / Math.PI));
  });

  it('samples the right longitude for each yaw relative to the heading', () => {
    const centre = (heading, yaw) => px(renderView(quadrants, { heading, yaw, ...small }), 64, 32, 24);
    assert.deepEqual(centre(0, 45), BLUE);
    assert.deepEqual(centre(0, -45), GREEN);
    assert.deepEqual(centre(0, 135), YELLOW);
    assert.deepEqual(centre(0, -135), RED);
    // the centre column faces the heading, wherever that is
    assert.deepEqual(centre(300, 345), BLUE);
    assert.deepEqual(centre(300, 255), GREEN);
  });

  it('wraps yaw around 360° and across the panorama seam', () => {
    const view = (heading, yaw) => renderView(quadrants, { heading, yaw, ...small });
    assert.ok(view(300, 345).equals(view(300, 705)));
    assert.ok(view(300, 345).equals(view(300, -15)));
    assert.ok(view(10, 20).equals(view(370, 20)));
    const seam = view(0, 180);
    assert.deepEqual(px(seam, 64, 16, 24), YELLOW); // just left of 180°
    assert.deepEqual(px(seam, 64, 48, 24), RED); // just right, wrapped to −180°
    assert.equal(wrap360(-100), 260);
    assert.equal(wrap360(725), 5);
  });

  it('is an exact inverse map with bilinear sampling (linear gradient pano)', () => {
    const gradient = equirect(256, 128, (lon, lat, u, v) => [u, v * 2, 0]);
    const odd = { width: 65, height: 49 };
    const centre = (opts) => px(renderView(gradient, { ...odd, ...opts }), 65, 32, 24);
    // u = (lon + 180) / 360 · 256 − 0.5, v = (90 − lat) / 180 · 128 − 0.5, rounded
    assert.deepEqual(centre({ heading: 0, yaw: 0, pitch: 0 }).slice(0, 2), [128, 127]);
    assert.deepEqual(centre({ heading: 0, yaw: 90, pitch: 0 }).slice(0, 2), [192, 127]);
    assert.deepEqual(centre({ heading: 40, yaw: 10, pitch: 0 })[0], Math.round(150 / 360 * 256 - 0.5));
    assert.equal(centre({ heading: 0, yaw: 0, pitch: -8 })[1], Math.round((98 / 180 * 128 - 0.5) * 2));
    assert.equal(centre({ heading: 0, yaw: 0, pitch: 20 })[1], Math.round((70 / 180 * 128 - 0.5) * 2));
  });

  it('renders 1024×768 by default', () => {
    const rgb = renderView(quadrants, { heading: 0, yaw: 45 });
    assert.equal(rgb.length, 1024 * 768 * 3);
    assert.deepEqual(px(rgb, 1024, 512, 384), BLUE);
  });
});

describe('panoviews filters', () => {
  const fill = (rgb, n = 1000) => Buffer.from(Array.from({ length: n }, () => rgb).flat());

  it('drops mostly-sky and very dark views, keeps roadside scenes', () => {
    assert.equal(viewQuality(fill([110, 160, 230])).keep, false); // blue sky
    assert.equal(viewQuality(fill([232, 232, 235])).keep, false); // overcast
    assert.equal(viewQuality(fill([20, 22, 25])).keep, false); // night
    assert.equal(viewQuality(fill([60, 140, 50])).keep, true); // fields
    const halfSky = Buffer.concat([fill([110, 160, 230], 500), fill([90, 80, 60], 500)]);
    const q = viewQuality(halfSky);
    near(q.sky, 0.5);
    assert.equal(q.keep, true);
    assert.ok(viewQuality(fill([39, 39, 39])).luminance < 40);
  });

  it('keeps rural boxes only', () => {
    const cities = bigCities([
      { properties: { pop_max: 1_700_000 }, geometry: { coordinates: [21.0, 52.25] } },
      { properties: { pop_max: 30_000 }, geometry: { coordinates: [20.0, 51.0] } },
    ]);
    assert.deepEqual(cities, [[21.0, 52.25]]);
    assert.equal(nearCity([21.02, 52.25], cities), true); // ~1.4 km
    assert.equal(nearCity([21.1, 52.25], cities), false); // ~6.8 km
    assert.equal(nearCity([20.0, 51.0], cities), false); // small town
  });

  it('parses panoramas, falling back to compass_angle, skipping ones without an original', () => {
    const [a, b, c] = fixture('mapillary-panos.json').data.map(parsePano);
    assert.deepEqual(a, { id: '812345678901234', lon: 20.5, lat: 51.5, heading: 30.5, url: 'https://scontent.xx.fbcdn.net/m1/v/t6/An_812345678901234_original.jpg', user: 'roofcam', capturedAt: 1700000000000 });
    assert.equal(b.heading, 200);
    assert.equal(c, null);
  });
});

describe('panoviews queueing', () => {
  const tiny = { type: 'Polygon', coordinates: [[[20.49, 51.49], [20.51, 51.49], [20.51, 51.51], [20.49, 51.51], [20.49, 51.49]]] };
  const square = { type: 'Polygon', coordinates: [[[20.45, 51.45], [20.55, 51.45], [20.55, 51.55], [20.45, 51.55], [20.45, 51.45]]] };

  it('queues each kept view as a bollard candidate with a per-view source URL', async (t) => {
    // right of the heading: fields; left: night-dark → the two left views are dropped
    const pano = equirect(1440, 720, (lon) => (lon > 0 ? [70, 130, 60] : [10, 10, 10]));
    const jpeg = await sharp(pano.data, { raw: { width: 1440, height: 720, channels: 3 } }).jpeg().toBuffer();
    const fetched = [];
    t.mock.method(globalThis, 'fetch', async (url) => (fetched.push(String(url)), new Response(jpeg)));
    const uploads = [];
    const inserted = [];
    const storage = { upload: async (path) => uploads.push(path) };
    const queue = { knownSourceUrls: async () => new Set(), insert: async (rows) => inserted.push(...rows) };
    const graph = { panoramas: async () => fixture('mapillary-panos.json') };
    const result = await runPanoviews('pl', { storage, queue, cap: 3, graph, geometry: square, cities: [] });

    assert.deepEqual(fetched, ['https://scontent.xx.fbcdn.net/m1/v/t6/An_812345678901234_original.jpg']);
    const urls = ['https://www.mapillary.com/app/?pKey=812345678901234&view=81', 'https://www.mapillary.com/app/?pKey=812345678901234&view=131'];
    assert.deepEqual(inserted.map((r) => r.sourceUrl), urls);
    assert.deepEqual(uploads, urls.map((u) => `candidates/${mediaId(u)}.webp`));
    const [row] = inserted;
    assert.equal(row.id, mediaId(urls[0]));
    assert.equal(row.subject, 'bollard');
    assert.equal(row.source, 'mapillary');
    assert.equal(row.country, 'pl');
    assert.equal(row.credit, 'roofcam · Mapillary · CC BY-SA 4.0');
    assert.equal(row.licence, 'CC BY-SA 4.0');
    assert.deepEqual([row.lat, row.lon], [51.5, 20.5]);
    assert.deepEqual([row.width, row.height], [1024, 768]);
    assert.match(row.preview, /^data:image\/webp;base64,/);
    assert.equal(row.image, undefined);
    assert.equal(result.counts.panoramas, 1); // the second pano is 0.7 km away, the third has no original
    assert.equal(result.counts.views, 2);
    assert.equal(result.counts.viewsDropped, 2);
    assert.equal(result.counts.queued, 2);
    assert.deepEqual(result.errors, []);
  });

  it('skips a panorama whose views are all queued, and urban boxes, without downloading', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => assert.fail('no download expected'));
    const pano = parsePano(fixture('mapillary-panos.json').data[0]);
    const known = new Set([50, 100, -50, -100].map((o) => viewCandidate(pano, pano.heading + o, 'pl').sourceUrl));
    const queue = { knownSourceUrls: async () => known, insert: async () => assert.fail('nothing to insert') };
    const graph = { panoramas: async () => fixture('mapillary-panos.json') };
    const done = await runPanoviews('pl', { storage: {}, queue, cap: 2, graph, geometry: square, cities: [] });
    assert.equal(done.counts.alreadyQueued, 4);
    const urban = await runPanoviews('pl', { storage: {}, queue, cap: 2, graph: { panoramas: async () => assert.fail('no query expected') }, geometry: tiny, cities: [[20.5, 51.5]] });
    assert.equal(urban.counts.boxes, 0);
    assert.equal(urban.counts.urbanSkipped, 12);
  });
});
