// GeoGuessr-like roadside views cut from Mapillary 360° panoramas (CC BY-SA 4.0). Panoramas come from
// roof-mounted cameras, like Google's, so roadside posts are far bigger than in dashcam frames.
// For each rural panorama: four rectilinear views, 1024×768, 75° horizontal FOV, pitched 8° down,
// at the driving heading ±50° and ±100°, queued as 'bollard' candidates through the usual ingest.
// Mapillary's equirectangular centre column is taken to face the panorama's compass angle
// (computed_compass_angle, else compass_angle), and that angle to be the driving direction.
// CLI: node tools/content/panoviews.mjs --country pl [--max 12] [--dry]
import sharp from 'sharp';
import { download } from './images.mjs';
import { haversineKm, isMain, mediaId, naturalEarth, parseArgs, poolCountry, randomPointsIn } from './lib/common.mjs';
import { ingest } from './lib/ingest.mjs';
import { LICENCE, bboxAround, countryGeometry, createGraph } from './mapillary.mjs';

const LICENCE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
export const VIEW = { width: 1024, height: 768, hfov: 75, pitch: -8 };
/** view yaws relative to the driving heading */
export const YAW_OFFSETS = [50, 100, -50, -100];
export const MIN_SPACING_KM = 5;
const CITY_RADIUS_KM = 3;
const CITY_POP = 50_000;
export const DEFAULT_BUDGET_MINUTES = 6;
const MIN_LUMINANCE = 40;
const MAX_SKY_SHARE = 0.6;

const RAD = Math.PI / 180;
const mod = (a, n) => ((a % n) + n) % n;
/** degrees → [0, 360) */
export const wrap360 = (deg) => mod(deg, 360);

/**
 * Direction of output pixel (x, y) (pixel centres at +0.5) of a pinhole camera pitched `pitch`
 * degrees (positive = up) → [longitude, latitude] in degrees, longitude relative to the camera's yaw.
 */
export function pixelToLonLat(x, y, { width, height, hfov, pitch }) {
  const f = width / 2 / Math.tan((hfov / 2) * RAD);
  const cx = x - width / 2;
  const cy = height / 2 - y; // up positive
  const p = pitch * RAD;
  // camera axes: x right, y up, z forward; rotate about x by the pitch
  const ry = cy * Math.cos(p) + f * Math.sin(p);
  const rz = -cy * Math.sin(p) + f * Math.cos(p);
  return [Math.atan2(cx, rz) / RAD, Math.atan2(ry, Math.hypot(cx, rz)) / RAD];
}

/**
 * Gnomonic view of an equirectangular panorama by inverse mapping with bilinear sampling.
 * `pano` = { data: raw RGB(A) Buffer, width, height, channels }; the centre column faces `heading`
 * (compass degrees), longitude grows to the right (clockwise), the top row is the zenith.
 * `yaw` is the compass direction the view faces. → raw RGB Buffer of view.width × view.height.
 */
export function renderView(pano, { heading, yaw, ...options }) {
  const view = { ...VIEW, ...options };
  const { data, width: W, height: H, channels: ch } = pano;
  const out = Buffer.alloc(view.width * view.height * 3);
  const rel = wrap360(yaw - heading);
  for (let y = 0; y < view.height; y++) {
    for (let x = 0; x < view.width; x++) {
      const [lon, lat] = pixelToLonLat(x + 0.5, y + 0.5, view);
      // continuous pixel coordinates, centres at integers
      const u = mod(((rel + lon + 180) / 360) * W - 0.5, W);
      const v = Math.min(Math.max(((90 - lat) / 180) * H - 0.5, 0), H - 1);
      const u0 = Math.floor(u);
      const v0 = Math.floor(v);
      const u1 = (u0 + 1) % W; // wraps across the 180° seam
      const v1 = Math.min(v0 + 1, H - 1);
      const fu = u - u0;
      const fv = v - v0;
      const a = (v0 * W + u0) * ch;
      const b = (v0 * W + u1) * ch;
      const c = (v1 * W + u0) * ch;
      const d = (v1 * W + u1) * ch;
      const o = (y * view.width + x) * 3;
      for (let k = 0; k < 3; k++) {
        const top = data[a + k] * (1 - fu) + data[b + k] * fu;
        const bottom = data[c + k] * (1 - fu) + data[d + k] * fu;
        out[o + k] = Math.round(top * (1 - fv) + bottom * fv);
      }
    }
  }
  return out;
}

/** Sky: bright and blue-ish, or near-white overcast. */
const isSky = (r, g, b, lum) => (lum > 120 && b > r && b >= g - 10) || lum > 215;

/** Raw RGB → { luminance (mean, 0..255), sky (share of sky pixels), keep }. */
export function viewQuality(rgb) {
  const n = rgb.length / 3;
  let total = 0;
  let sky = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    const lum = 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
    total += lum;
    if (isSky(rgb[i], rgb[i + 1], rgb[i + 2], lum)) sky++;
  }
  const luminance = total / n;
  const skyShare = sky / n;
  return { luminance, sky: skyShare, keep: luminance >= MIN_LUMINANCE && skyShare <= MAX_SKY_SHARE };
}

/** Populated places with more than CITY_POP people, as [lon, lat]. */
export const bigCities = (features) =>
  features.filter((f) => (f.properties?.pop_max ?? 0) > CITY_POP).map((f) => f.geometry.coordinates);

export const nearCity = (point, cities, km = CITY_RADIUS_KM) => cities.some((c) => haversineKm(c, point) < km);

/** Mapillary panorama JSON → { id, lon, lat, heading, url, user, capturedAt }; null if unusable. */
export function parsePano(image) {
  const heading = image?.computed_compass_angle ?? image?.compass_angle;
  const [lon, lat] = image?.computed_geometry?.coordinates ?? [];
  if (!image?.id || !image.thumb_original_url || !Number.isFinite(heading) || lon == null || lat == null) return null;
  if (image.width && image.height && image.width !== 2 * image.height) return null;
  return { id: image.id, lon, lat, heading: wrap360(heading), url: image.thumb_original_url, user: image.creator?.username ?? 'unknown', capturedAt: image.captured_at };
}

/** The candidate for one view of a panorama (`yaw` in compass degrees, rounded). */
export function viewCandidate(pano, yaw, country) {
  const view = Math.round(wrap360(yaw));
  const sourceUrl = `https://www.mapillary.com/app/?pKey=${pano.id}&view=${view}`;
  return {
    id: mediaId(sourceUrl),
    country,
    subject: 'bollard',
    source: 'mapillary',
    sourceUrl,
    downloadUrl: pano.url,
    credit: `${pano.user} · Mapillary · ${LICENCE}`,
    licence: LICENCE,
    licenceUrl: LICENCE_URL,
    lat: pano.lat,
    lon: pano.lon,
    capturedAt: pano.capturedAt,
  };
}

/** Decodes a panorama → raw RGB { data, width, height, channels }; throws unless it is 2:1. */
export async function decodePano(buffer) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 2 * info.height) throw new Error(`panorama is ${info.width}×${info.height}, not 2:1`);
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/** One panorama's kept views as candidates with an encoded `image`, plus how many were dropped. */
export async function cutViews(pano, panoBuffer, country) {
  const decoded = await decodePano(panoBuffer);
  const views = [];
  let dropped = 0;
  for (const offset of YAW_OFFSETS) {
    const yaw = pano.heading + offset;
    const rgb = renderView(decoded, { heading: pano.heading, yaw });
    if (!viewQuality(rgb).keep) {
      dropped++;
      continue;
    }
    const image = await sharp(rgb, { raw: { width: VIEW.width, height: VIEW.height, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer();
    views.push({ ...viewCandidate(pano, yaw, country), image });
  }
  return { views, dropped };
}

/**
 * For one country: samples boxes, keeps at most one rural panorama per box, MIN_SPACING_KM apart,
 * cuts and queues its views, until `cap` panoramas, the attempts run out, or `deadline` passes.
 */
export async function runPanoviews(code, { storage, queue, cap = 12, graph = createGraph(), deadline = Infinity, rng = Math.random, geometry, cities } = {}) {
  geometry ??= await countryGeometry(code);
  cities ??= bigCities((await naturalEarth('ne_10m_populated_places_simple.geojson')).features);
  const points = randomPointsIn(geometry, cap * 6, rng);
  const known = await queue.knownSourceUrls(code);
  const kept = [];
  const seen = new Set();
  const errors = [];
  const counts = { boxes: 0, urbanSkipped: 0, panoramas: 0, views: 0, viewsDropped: 0, alreadyQueued: 0, queued: 0, failed: 0 };
  let budgetHit = false;
  for (const point of points) {
    if (kept.length >= cap) break;
    if (Date.now() >= deadline) {
      budgetHit = true;
      break;
    }
    if (nearCity(point, cities)) {
      counts.urbanSkipped++;
      continue;
    }
    counts.boxes++;
    let pano;
    try {
      const found = ((await graph.panoramas(bboxAround(point))).data ?? []).map(parsePano).filter(Boolean);
      pano = found.find((p) => !seen.has(p.id) && !kept.some((k) => haversineKm([k.lon, k.lat], [p.lon, p.lat]) < MIN_SPACING_KM));
    } catch (error) {
      errors.push(error.message);
      if (errors.length >= 5) break; // a bad token or an outage: stop early, say why
      continue;
    }
    if (!pano) continue;
    seen.add(pano.id);
    kept.push(pano);
    counts.panoramas++;
    if (YAW_OFFSETS.every((o) => known.has(viewCandidate(pano, pano.heading + o, code).sourceUrl))) {
      counts.alreadyQueued += YAW_OFFSETS.length;
      continue;
    }
    try {
      const { views, dropped } = await cutViews(pano, await download(pano.url), code);
      counts.views += views.length;
      counts.viewsDropped += dropped;
      if (views.length === 0) continue;
      const result = await ingest(views, { storage, queue, cap: views.length });
      counts.alreadyQueued += result.counts.alreadyQueued;
      counts.queued += result.counts.queued;
      counts.failed += result.counts.failed;
      errors.push(...result.errors);
    } catch (error) {
      counts.failed++;
      errors.push(`pano ${pano.id}: ${error.message}`);
    }
  }
  return { counts, errors, ...(budgetHit && { budgetHit }) };
}

if (isMain(import.meta)) {
  const { country, max = '12', dry } = parseArgs();
  const code = poolCountry(country).code.toLowerCase();
  if (dry) {
    const fake = { knownSourceUrls: async () => new Set(), insert: async () => {} };
    console.log(JSON.stringify(await runPanoviews(code, { storage: { upload: async () => {} }, queue: fake, cap: Number(max) }), null, 2));
  } else {
    const { createStorage } = await import('./storage.mjs');
    const { createQueue } = await import('./queue.mjs');
    console.log(JSON.stringify(await runPanoviews(code, { storage: createStorage(), queue: createQueue(), cap: Number(max) }), null, 2));
  }
}
