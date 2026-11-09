// Mapillary street-level photos (CC BY-SA 4.0) at random spots inside a country.
// Poles come from Mapillary's utility-pole detections; anything else (and poles where nothing is
// detected) is a plain roadside scene filed under 'bollard' — Mapillary has no bollard class.
// CLI: node tools/content/mapillary.mjs --country pl --subject pole [--max 30] [--dry]
import { haversineKm, isMain, isoOf, naturalEarth, parseArgs, poolCountry, randomPointsIn, request } from './lib/common.mjs';
import { ingest } from './lib/ingest.mjs';

const GRAPH = 'https://graph.mapillary.com';
/** degrees per side; the API rejects boxes of 0.01 deg² or more */
export const BOX_SIDE = 0.05;
const MIN_SPACING_KM = 10;
const MAX_PER_BOX = 3;
const IMAGE_FIELDS = 'id,thumb_2048_url,computed_geometry,geometry,creator,captured_at,width,height,is_pano';
export const LICENCE = 'CC BY-SA 4.0';
const LICENCE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

export function bboxAround([lon, lat], side = BOX_SIDE) {
  const h = side / 2;
  return [lon - h, lat - h, lon + h, lat + h].map((n) => Number(n.toFixed(5)));
}

/** Mapillary image JSON → candidate; null for panoramas or images without a thumbnail. */
export function parseImage(image, { country, subject }) {
  if (!image?.id || !image.thumb_2048_url || image.is_pano) return null;
  const [lon, lat] = (image.computed_geometry ?? image.geometry)?.coordinates ?? [];
  const user = image.creator?.username ?? 'unknown';
  return {
    id: `${country}-m${image.id}`,
    country,
    subject,
    source: 'mapillary',
    sourceUrl: `https://www.mapillary.com/app/?pKey=${image.id}`,
    downloadUrl: image.thumb_2048_url,
    credit: `${user} · Mapillary · ${LICENCE}`,
    licence: LICENCE,
    licenceUrl: LICENCE_URL,
    lat,
    lon,
    capturedAt: image.captured_at,
  };
}

/** Keeps candidates at least MIN_SPACING_KM from every kept one, at most MAX_PER_BOX per box. */
export function spaceOut(candidates, kept = []) {
  const out = [];
  const perBox = new Map();
  for (const c of candidates) {
    if (c.lon == null || c.lat == null) continue;
    const n = perBox.get(c.box) ?? 0;
    if (n >= MAX_PER_BOX) continue;
    if ([...kept, ...out].some((k) => haversineKm([k.lon, k.lat], [c.lon, c.lat]) < MIN_SPACING_KM)) continue;
    perBox.set(c.box, n + 1);
    out.push(c);
  }
  return out;
}

export function createGraph(token = process.env.MAPILLARY_TOKEN) {
  if (!token) throw new Error('MAPILLARY_TOKEN is not set (repo secret)');
  const get = async (path, params) => {
    const res = await request(`${GRAPH}/${path}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `OAuth ${token}` },
    });
    return res.json();
  };
  return {
    images: (bbox, limit = 10) =>
      get('images', { bbox: bbox.join(','), is_pano: 'false', fields: IMAGE_FIELDS, limit: String(limit) }),
    poles: (bbox, limit = 10) =>
      get('map_features', {
        bbox: bbox.join(','),
        object_values: 'object--support--utility-pole',
        fields: 'id,object_value,geometry',
        limit: String(limit),
      }),
    /** ids of the images in which a map feature was detected */
    featureImages: async (featureId) =>
      ((await get(featureId, { fields: 'images' })).images?.data ?? []).map((i) => i.id),
    image: (id) => get(id, { fields: IMAGE_FIELDS }),
  };
}

/** The country's Natural Earth admin-0 geometry. */
export async function countryGeometry(code) {
  const fc = await naturalEarth('ne_50m_admin_0_countries.geojson');
  const feature = fc.features.find((f) => isoOf(f.properties)?.toUpperCase() === code.toUpperCase());
  if (!feature) throw new Error(`${code} not found in Natural Earth admin-0 (50m)`);
  return feature.geometry;
}

/** One box's candidates: detected poles' images, else roadside scenes as 'bollard'. */
export async function boxCandidates(graph, bbox, country, subject) {
  const box = bbox.join(',');
  if (subject === 'pole') {
    const features = (await graph.poles(bbox)).data ?? [];
    const out = [];
    for (const feature of features.slice(0, MAX_PER_BOX)) {
      const [imageId] = await graph.featureImages(feature.id);
      const parsed = imageId && parseImage(await graph.image(imageId), { country, subject: 'pole' });
      if (parsed) out.push({ ...parsed, box });
    }
    if (out.length > 0) return out;
  }
  const images = (await graph.images(bbox)).data ?? [];
  return images.map((image) => parseImage(image, { country, subject: 'bollard' })).filter(Boolean).map((c) => ({ ...c, box }));
}

/** Samples boxes until `limit` spaced-out candidates are found or the attempts run out. */
export async function findCandidates(code, subject, limit = 30, { graph = createGraph(), rng = Math.random } = {}) {
  const geometry = await countryGeometry(code);
  const points = randomPointsIn(geometry, limit * 4, rng);
  const kept = [];
  const errors = [];
  for (const point of points) {
    if (kept.length >= limit) break;
    try {
      kept.push(...spaceOut(await boxCandidates(graph, bboxAround(point), code, subject), kept));
    } catch (error) {
      errors.push(error.message);
      if (errors.length >= 5) break; // a bad token or an outage: stop early, say why
    }
  }
  return { candidates: kept.slice(0, limit), boxes: points.length, errors };
}

export async function runMapillary(code, subject, { storage, queue, cap = 30, graph }) {
  const found = await findCandidates(code, subject, cap * 2, { graph });
  const result = await ingest(found.candidates, { storage, queue, cap });
  const bySubject = {};
  for (const c of found.candidates) bySubject[c.subject] = (bySubject[c.subject] ?? 0) + 1;
  return { counts: { boxes: found.boxes, ...result.counts, bySubject }, errors: [...found.errors, ...result.errors] };
}

if (isMain(import.meta)) {
  const { country, subject = 'bollard', max = '30', dry } = parseArgs();
  const code = poolCountry(country).code.toLowerCase();
  if (dry) console.log(JSON.stringify(await findCandidates(code, subject, Number(max)), null, 2));
  else {
    const { createStorage } = await import('./storage.mjs');
    const { createQueue } = await import('./queue.mjs');
    console.log(JSON.stringify(await runMapillary(code, subject, { storage: createStorage(), queue: createQueue(), cap: Number(max) }), null, 2));
  }
}
