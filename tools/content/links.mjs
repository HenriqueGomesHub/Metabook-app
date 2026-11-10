// Google Maps links of Plonk It and GeoHints images → Street View spots. Short links (goo.gl/maps, maps.app.goo.gl)
// are resolved by following their redirects by hand, one request per second, and cached in
// content/sources/links.json ({ "<short url>": { url } | { error } }) so re-runs only try the rest.
// The `clues` step parses the long URLs with parseMapsUrl.
import { join } from 'node:path';
import { BROWSER_USER_AGENT, CONTENT, jsonFilesIn, pacer, readJson, sleep, writeJson } from './lib/common.mjs';
import { geohintsImageLinks } from './geohints.mjs';
import { PLONKIT_DIR } from './plonkit.mjs';

export const LINKS_PATH = join(CONTENT, 'sources', 'links.json');
const MAX_HOPS = 5;
/** Google throttling every request: stop and leave the rest to a later run. */
const MAX_FAILURES_IN_A_ROW = 20;

const LONG = /^https?:\/\/(www\.)?google\.[a-z.]+\/maps\b/i;
const SHORT = /^https?:\/\/(goo\.gl\/maps\/|maps\.app\.goo\.gl\/)/i;
export const isMapsLink = (url) => LONG.test(url ?? '') || SHORT.test(url ?? '');
export const isShortLink = (url) => SHORT.test(url ?? '');

const round = (n) => Math.round(n * 100) / 100;

/**
 * A Street View URL → { pano?, lat, lng, heading, pitch, fov }, or undefined when it is not one
 * (no "@lat,lng,<n>a" part). pitch = t - 90 (t defaults to 90), fov = the "y" value (default 75).
 * Pano ids of user photospheres (AF1Qip…, CIHM…) are dropped: only official coverage keeps a pano.
 */
export function parseMapsUrl(url) {
  let text;
  try {
    text = decodeURIComponent(url);
  } catch {
    text = url;
  }
  const api = apiPano(text);
  if (api) return api;
  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),\d+(?:\.\d+)?a((?:,-?\d+(?:\.\d+)?[a-z])*)/);
  if (!at) return undefined;
  const lat = Number(at[1]);
  const lng = Number(at[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  const parts = Object.fromEntries([...at[3].matchAll(/,(-?\d+(?:\.\d+)?)([a-z])/g)].map((m) => [m[2], Number(m[1])]));
  const pano = text.match(/!1s([^!/?&]+)/)?.[1];
  return {
    ...(pano && pano.length === 22 && !/^(AF1Qip|CIHM)/.test(pano) && { pano }),
    lat,
    lng,
    heading: round(parts.h ?? 0),
    pitch: round((parts.t ?? 90) - 90),
    fov: round(parts.y ?? 75),
  };
}

/** Maps URLs API form: ...?api=1&map_action=pano&pano=<id>&viewpoint=<lat>,<lng>&heading=&pitch=&fov= */
function apiPano(text) {
  const query = text.slice(text.indexOf('?') + 1);
  if (!text.includes('?') || !/(^|&)map_action=pano(&|$)/.test(query)) return undefined;
  const params = new URLSearchParams(query);
  const [lat, lng] = (params.get('viewpoint') ?? '').split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  const pano = params.get('pano') ?? '';
  const num = (key, fallback) => {
    const value = params.get(key);
    return value === null || !Number.isFinite(Number(value)) ? fallback : Number(value);
  };
  return {
    ...(pano.length === 22 && !/^(AF1Qip|CIHM)/.test(pano) && { pano }),
    lat,
    lng,
    heading: round(num('heading', 0)),
    pitch: round(num('pitch', 0)),
    fov: round(num('fov', 75)),
  };
}

/** Google's consent interstitial carries the real URL in `continue`. */
function unwrapConsent(url) {
  const parsed = new URL(url);
  return parsed.hostname.startsWith('consent.') && parsed.searchParams.get('continue') ? parsed.searchParams.get('continue') : url;
}

/**
 * Follows a short link's redirects (at most 5) → { url } (the first long Street View URL, or where
 * the redirects end), or { error } for a link that is gone (4xx). Throws on 429, 5xx and network
 * errors, which are worth another try on a later run.
 */
export async function resolveLink(start, { fetchImpl = fetch, wait = async () => {} } = {}) {
  let url = start;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    await wait();
    const res = await fetchImpl(url, {
      redirect: 'manual',
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      url = unwrapConsent(new URL(location, url).href);
      if (parseMapsUrl(url)) return { url };
      continue;
    }
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status} for ${url}`);
    if (res.status >= 400) return { error: `HTTP ${res.status}` };
    return { url };
  }
  return { url };
}

/** Every Google Maps image link in the cached Plonk It pages, sorted. */
export function plonkitImageLinks(dir = PLONKIT_DIR) {
  const links = new Set();
  for (const file of jsonFilesIn(dir)) {
    for (const step of readJson(join(dir, file)).data?.public?.steps ?? []) {
      for (const item of step.items ?? []) {
        const link = item.data?.image?.imageLink;
        if (isMapsLink(link)) links.add(link);
      }
    }
  }
  return [...links].sort();
}

/**
 * The `links` step: resolves the short links not in the cache yet, Plonk It's first, then GeoHints'
 * (content/sources/geohints, next to `dir`), saving the cache every 50.
 */
export async function runLinks({ dir = PLONKIT_DIR, geohintsDir = join(dir, '..', 'geohints'), path = LINKS_PATH, deadline = Infinity, fetchImpl = fetch, pause = sleep } = {}) {
  const cache = readJson(path, {});
  const save = () => writeJson(path, Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b))));
  const todo = [...new Set([...plonkitImageLinks(dir), ...geohintsImageLinks(geohintsDir)])].filter((l) => isShortLink(l) && !cache[l]);
  const wait = pacer(1000, pause);
  const counts = { todo: todo.length, resolved: 0, gone: 0, failed: 0 };
  const errors = [];
  let budgetHit = false;
  let inARow = 0;
  for (const link of todo) {
    if (Date.now() >= deadline) {
      budgetHit = true;
      break;
    }
    try {
      cache[link] = await resolveLink(link, { fetchImpl, wait });
      counts[cache[link].error ? 'gone' : 'resolved']++;
      inARow = 0;
    } catch (error) {
      counts.failed++;
      errors.push(`${link}: ${error.message}`);
      if (++inARow >= MAX_FAILURES_IN_A_ROW) {
        errors.push(`stopped after ${inARow} failures in a row`);
        break;
      }
      continue;
    }
    if ((counts.resolved + counts.gone) % 50 === 0) save();
  }
  save();
  counts.left = todo.length - counts.resolved - counts.gone;
  return { counts, errors: errors.slice(0, 100), ...(budgetHit && { budgetHit }) };
}
