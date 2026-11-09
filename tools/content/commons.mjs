// Wikimedia Commons photos for a country and subject: maps the subject to categories, walks their
// subcategories to depth 2, keeps freely licensed photos, and queues them for curation.
// CLI: node tools/content/commons.mjs --country pl --subject pole [--max 40] [--dry]
import { getJson, isMain, parseArgs, poolCountry, stripHtml } from './lib/common.mjs';
import { ingest } from './lib/ingest.mjs';

const API = 'https://commons.wikimedia.org/w/api.php';
const MAX_DEPTH = 2;
const MAX_CATEGORIES = 150;
const MIN_WIDTH = 800;

export const CATEGORY_PATTERNS = {
  pole: ['Utility poles in %s'],
  plate: ['License plates of %s', 'Vehicle registration plates of %s'],
  sign: ['Road signs in %s'],
  bollard: ['Delineators in %s'],
  guardrail: ['Guard rails in %s'],
};

/** Subjects where only photos are useful; road-sign SVG diagrams may still teach signs. */
const PHOTO_SUBJECTS = new Set(['pole', 'plate', 'bollard', 'guardrail']);
const RASTER = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/tiff']);
const FREE_LICENCE = /^(cc0|cc[ -]by(-sa)?[ -]\d|public domain|pd\b|pd-)/i;

/** Commons names some countries differently or with "the". */
const COMMONS_NAMES = { Czechia: ['the Czech Republic'], 'North Macedonia': ['North Macedonia'] };

export function countryNames(name) {
  return [...new Set([...(COMMONS_NAMES[name] ?? []), name, `the ${name}`])];
}

/** Every candidate category title for a subject, in the order they are tried. */
export function categoriesFor(subject, countryName) {
  return (CATEGORY_PATTERNS[subject] ?? []).flatMap((pattern) =>
    countryNames(countryName).map((name) => `Category:${pattern.replace('%s', name)}`),
  );
}

const api = (params) =>
  getJson(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`);

/** Titles that exist, from a prop=categoryinfo response. */
export const existingTitles = (json) =>
  (json.query?.pages ?? []).filter((p) => !p.missing).map((p) => p.title);

export function licenceOk(shortName) {
  return FREE_LICENCE.test((shortName ?? '').trim());
}

/**
 * One file page (formatversion=2, prop=imageinfo with extmetadata) → candidate, or a reason
 * string when it is dropped.
 */
export function parseFilePage(page, { country, subject }) {
  const info = page.imageinfo?.[0];
  if (!info) return 'no imageinfo';
  const meta = info.extmetadata ?? {};
  const licence = stripHtml(meta.LicenseShortName?.value);
  const svg = info.mime === 'image/svg+xml';
  if (/logo/i.test(page.title)) return 'logo';
  if (svg ? PHOTO_SUBJECTS.has(subject) : !RASTER.has(info.mime)) return `type ${info.mime}`;
  if (!svg && info.width < MIN_WIDTH) return 'too small';
  if (!licenceOk(licence)) return `licence ${licence || 'unknown'}`;
  const artist = stripHtml(meta.Artist?.value) || 'Unknown author';
  const description = stripHtml(meta.ImageDescription?.value);
  return {
    id: `${country}-c${page.pageid}`,
    country,
    subject,
    source: 'commons',
    sourceUrl: info.descriptionurl,
    downloadUrl: info.thumburl ?? info.url,
    credit: `${artist.length > 80 ? `${artist.slice(0, 79)}…` : artist} · Wikimedia Commons · ${licence}`,
    licence,
    licenceUrl: stripHtml(meta.LicenseUrl?.value) || undefined,
    title: page.title.replace(/^File:/, ''),
    caption: description ? description.slice(0, 200) : undefined,
  };
}

async function subcategories(title) {
  const out = [];
  let cont = {};
  do {
    const json = await api({ action: 'query', list: 'categorymembers', cmtitle: title, cmtype: 'subcat', cmlimit: '500', ...cont });
    out.push(...(json.query?.categorymembers ?? []).map((m) => m.title));
    cont = json.continue ?? null;
  } while (cont);
  return out;
}

/** Roots plus subcategories to depth 2, breadth first, capped. */
async function walk(roots) {
  const seen = new Set(roots);
  let level = roots;
  for (let depth = 0; depth < MAX_DEPTH && seen.size < MAX_CATEGORIES; depth++) {
    const next = [];
    for (const title of level) {
      for (const sub of await subcategories(title)) {
        if (seen.size >= MAX_CATEGORIES) break;
        if (seen.has(sub)) continue;
        seen.add(sub);
        next.push(sub);
      }
    }
    level = next;
  }
  return [...seen];
}

/**
 * Finds up to `limit` usable candidates for one country and subject.
 * Returns { candidates, categories, dropped: { reason: count } }.
 */
export async function findCandidates(code, subject, limit = 40) {
  if (!CATEGORY_PATTERNS[subject]) return { candidates: [], categories: [], dropped: { 'no Commons mapping for subject': 1 } };
  const { name } = poolCountry(code);
  const titles = categoriesFor(subject, name);
  const roots = existingTitles(await api({ action: 'query', titles: titles.join('|'), prop: 'categoryinfo' }));
  const categories = await walk(roots);
  const candidates = [];
  const seen = new Set();
  const dropped = {};
  for (const category of categories) {
    let cont = {};
    while (cont && candidates.length < limit) {
      const json = await api({
        action: 'query',
        generator: 'categorymembers',
        gcmtitle: category,
        gcmtype: 'file',
        gcmlimit: '50',
        prop: 'imageinfo',
        iiprop: 'url|size|mime|extmetadata',
        iiurlwidth: '1280',
        iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ImageDescription',
        ...cont,
      });
      for (const page of json.query?.pages ?? []) {
        if (seen.has(page.pageid)) continue;
        seen.add(page.pageid);
        const result = parseFilePage(page, { country: code, subject });
        if (typeof result === 'string') {
          const reason = result.split(' ')[0];
          dropped[reason] = (dropped[reason] ?? 0) + 1;
        }
        else if (candidates.length < limit) candidates.push(result);
      }
      cont = json.continue ?? null;
    }
    if (candidates.length >= limit) break;
  }
  return { candidates, categories: roots, dropped };
}

/** Finds and queues new photos; `cap` new ones at most. */
export async function runCommons(code, subject, { storage, queue, cap = 40 }) {
  // look further than the cap so re-runs still find photos that are not queued yet
  const found = await findCandidates(code, subject, cap * 3);
  const result = await ingest(found.candidates, { storage, queue, cap });
  return { counts: { categories: found.categories.length, ...result.counts }, dropped: found.dropped, errors: result.errors };
}

if (isMain(import.meta)) {
  const { country, subject, max = '40', dry } = parseArgs();
  const code = poolCountry(country).code.toLowerCase();
  if (dry) {
    const found = await findCandidates(code, subject, Number(max));
    console.log(JSON.stringify(found, null, 2));
  } else {
    const { createStorage } = await import('./storage.mjs');
    const { createQueue } = await import('./queue.mjs');
    console.log(JSON.stringify(await runCommons(code, subject, { storage: createStorage(), queue: createQueue(), cap: Number(max) }), null, 2));
  }
}
