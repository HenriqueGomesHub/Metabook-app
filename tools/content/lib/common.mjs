// Shared helpers: repo paths, JSON files, HTTP with retries, small geo maths.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
export const CONTENT = join(ROOT, 'content');
export const USER_AGENT = 'Metabook-content-bot/1.0 (https://github.com/HenriqueGomesHub/Metabook-app)';
export const NATURAL_EARTH =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';

export const readJson = (path, fallback) =>
  existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export const jsonFilesIn = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];

export const loadPool = () => readJson(join(CONTENT, 'pool.json'), []);

/** Pool entry for a code in any case; throws for unknown codes. */
export function poolCountry(code, pool = loadPool()) {
  const hit = pool.find((c) => c.code === code.toUpperCase());
  if (!hit) throw new Error(`${code} is not in content/pool.json`);
  return hit;
}

/** `codes` from a job or CLI: an array, a comma list, or "all" (every in_pool country). Lower case. */
export function resolveCountries(codes, pool = loadPool()) {
  if (codes === 'all') return pool.filter((c) => c.in_pool).map((c) => c.code.toLowerCase());
  const list = Array.isArray(codes) ? codes : String(codes).split(',');
  return list.map((c) => poolCountry(c.trim(), pool).code.toLowerCase());
}

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} for ${url.replace(/access_token=[^&]+/, 'access_token=…')}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** fetch with a User-Agent, a timeout and retries on 429/5xx and network errors. */
export async function request(url, init = {}, { retries = 3, timeoutMs = 60_000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'User-Agent': USER_AGENT, ...init.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res;
      const body = await res.text();
      if (attempt < retries && (res.status === 429 || res.status >= 500)) {
        await sleep(Number(res.headers.get('retry-after')) * 1000 || 2 ** attempt * 1000);
        continue;
      }
      throw new HttpError(res.status, url, body);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (attempt >= retries) {
        const cause = error.cause?.code ?? error.cause?.message ?? error.name;
        throw new Error(`${error.message} (${cause}) for ${new URL(url).host}`);
      }
      await sleep(2 ** attempt * 1000);
    }
  }
}

export const getJson = async (url, init, options) => (await request(url, init, options)).json();

/** Downloads a Natural Earth GeoJSON once per machine (cached in RUNNER_TEMP or the OS temp dir). */
export async function naturalEarth(name) {
  const dir = join(process.env.RUNNER_TEMP ?? (await import('node:os')).tmpdir(), 'natural-earth');
  const path = join(dir, name);
  if (!existsSync(path)) {
    const res = await request(`${NATURAL_EARTH}/${name}`, {}, { timeoutMs: 300_000 });
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Natural Earth codes are "-99" for a few countries (France, Norway, Kosovo); the _EH field fixes that. */
export const isoOf = (props) =>
  [props.ISO_A2_EH, props.ISO_A2, props.iso_a2].find((v) => v && v !== '-99');

export function haversineKm([lon1, lat1], [lon2, lat2]) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

const polygonsOf = (geometry) =>
  geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Planar point-in-polygon on lon/lat, holes respected. */
export const contains = (geometry, point) =>
  polygonsOf(geometry).some(([outer, ...holes]) => inRing(point, outer) && !holes.some((h) => inRing(point, h)));

/** Random [lon, lat] points inside a geometry (rejection sampling in its bounding box). */
export function randomPointsIn(geometry, count, rng = Math.random, maxTries = count * 500) {
  const coords = polygonsOf(geometry).flatMap((p) => p[0]);
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const [x0, x1, y0, y1] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const out = [];
  for (let i = 0; i < maxTries && out.length < count; i++) {
    const point = [x0 + rng() * (x1 - x0), y0 + rng() * (y1 - y0)];
    if (contains(geometry, point)) out.push(point);
  }
  return out;
}

/** Strips tags and decodes the entities Commons metadata uses. */
export function stripHtml(html = '') {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Command-line flags: --country pl --subject pole → { country: 'pl', subject: 'pole' }. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    const next = argv[i + 1];
    out[key] = next && !next.startsWith('--') ? (i++, next) : true;
  }
  return out;
}

export const isMain = (meta) => process.argv[1] && fileURLToPath(meta.url) === process.argv[1];

/** CC0, public domain, CC BY and CC BY-SA, by Commons' LicenseShortName; the only licences photos may carry. */
export const FREE_LICENCE = /^(cc0|cc[ -]by(-sa)?[ -]\d|public domain|pd\b|pd-)/i;
export const licenceOk = (shortName) => FREE_LICENCE.test((shortName ?? '').trim());

/** Photo id and storage name: 12 hex chars of sha1(source_url), so nothing in it hints at the country. */
export const mediaId = (sourceUrl) => createHash('sha1').update(sourceUrl).digest('hex').slice(0, 12);

/**
 * Supabase auth headers. The new secret keys (`sb_secret_…`) are not JWTs, so they go in `apikey`
 * only; legacy service_role JWTs also need `Authorization: Bearer`.
 */
export const supabaseHeaders = (key) =>
  key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };

export function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (repo secret)`);
  return value;
}
