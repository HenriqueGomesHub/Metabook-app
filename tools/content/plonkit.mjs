// The Plonk It guide: https://www.plonkit.net/guide lists the countries and every country page embeds
// its content as JSON in <script id="__PRELOADED_DATA__">. Each page's JSON (plus `fetchedAt`) is
// cached in content/sources/plonkit/<slug>.json and the guide's in _guide.json, so the `links` and
// `clues` steps and later runs work offline. One request every 4 s; a page already cached is skipped
// (unless older than `refreshDays`), so a run stopped by its budget carries on where it left off.
import { join } from 'node:path';
import { BROWSER_USER_AGENT, CONTENT, pacer, readJson, sleep, writeJson } from './lib/common.mjs';

export const PLONKIT = 'https://www.plonkit.net';
export const PLONKIT_DIR = join(CONTENT, 'sources', 'plonkit');
const NON_COUNTRY = new Set(['spillover-countries', 'maps', 'beginners-guide', 'middle-earth']);
const DAY = 86_400_000;

/** The JSON a Plonk It page embeds, or null (a Cloudflare challenge page has none). */
export function parsePreloaded(html) {
  const match = html.match(/<script[^>]*id="__PRELOADED_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  try {
    return match ? JSON.parse(match[1]) : null;
  } catch {
    return null;
  }
}

/** The guide's country rows → [{ slug, code, title }]. Rows are [title, slug, code, …] or objects. */
export function guideCountries(guide) {
  const rows = [guide, guide?.data, guide?.data?.public, guide?.data?.countries].find(Array.isArray) ?? [];
  return rows
    .map((r) => (Array.isArray(r) ? { title: r[0], slug: r[1], code: r[2] } : { title: r?.title, slug: r?.slug, code: r?.code }))
    .filter((c) => typeof c.slug === 'string' && /^[\w-]+$/.test(c.slug) && !NON_COUNTRY.has(c.slug));
}

/** True when a cached page is there and, with `refreshDays`, younger than that. */
export const isFresh = (cached, refreshDays, now = Date.now()) =>
  Boolean(cached) && (refreshDays == null || now - Date.parse(cached.fetchedAt ?? 0) < refreshDays * DAY);

/** Fetches a page until it carries __PRELOADED_DATA__, backing off 30 s, 60 s… between tries. */
async function fetchPreloaded(path, { fetchImpl, wait, pause, deadline, attempts = 4 }) {
  let problem;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await wait();
    try {
      const res = await fetchImpl(`${PLONKIT}/${path}`, {
        headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'text/html' },
        signal: AbortSignal.timeout(60_000),
      });
      const data = parsePreloaded(await res.text());
      if (data) return data;
      problem = `HTTP ${res.status} without __PRELOADED_DATA__ (challenge page?)`;
    } catch (error) {
      problem = error.message;
    }
    const backoff = 30_000 * attempt;
    if (attempt === attempts || Date.now() + backoff > deadline) break;
    await pause(backoff);
  }
  throw new Error(`${path}: ${problem}`);
}

/** The `plonkit` step. */
export async function runPlonkit({ dir = PLONKIT_DIR, deadline = Infinity, refreshDays, fetchImpl = fetch, pause = sleep } = {}) {
  const options = { fetchImpl, wait: pacer(4000, pause), pause, deadline };
  const errors = [];
  const guidePath = join(dir, '_guide.json');
  let guide;
  try {
    guide = await fetchPreloaded('guide', options);
    writeJson(guidePath, guide);
  } catch (error) {
    guide = readJson(guidePath);
    if (!guide) throw error;
    errors.push(`${error.message}; using the cached guide`);
  }
  const countries = guideCountries(guide);
  if (countries.length === 0) throw new Error('the guide lists no countries (has its shape changed?)');

  const counts = { countries: countries.length, fetched: 0, cached: 0, failed: 0 };
  let budgetHit = false;
  for (const { slug } of countries) {
    const path = join(dir, `${slug}.json`);
    if (isFresh(readJson(path), refreshDays)) {
      counts.cached++;
      continue;
    }
    if (Date.now() >= deadline) {
      budgetHit = true;
      break;
    }
    try {
      const data = await fetchPreloaded(slug, options);
      if (!Array.isArray(data?.data?.public?.steps)) throw new Error(`${slug}: page data has no steps`);
      writeJson(path, { fetchedAt: new Date().toISOString(), ...data });
      counts.fetched++;
    } catch (error) {
      counts.failed++;
      errors.push(error.message);
    }
  }
  return { counts, errors, ...(budgetHit && { budgetHit }) };
}
