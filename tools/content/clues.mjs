// The cached sources (content/sources: Plonk It pages, Learnable Meta maps, GeoHints, resolved links) →
// content/clues/<code>.json (ClueCountry, packages/core/src/clues.ts) and content/clues/index.json.
// Offline and deterministic: the same sources always give the same files.
// CLI: node tools/content/clues.mjs [--sources <dir>] [--out <dir>]
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT, isMain, jsonFilesIn, loadPool, mediaId, parseArgs, readJson, stripHtml, writeJson } from './lib/common.mjs';
import { markDupes } from './lib/phash.mjs';
import { GEOHINTS, GEOHINTS_STEP, buildGeoHints, loadGeoHints } from './geohints.mjs';
import { LEARNABLE_META } from './learnablemeta.mjs';
import { isMapsLink, isShortLink, parseMapsUrl } from './links.mjs';
import { PLONKIT } from './plonkit.mjs';
import { REVIEW_IMAGES_DIR, REVIEW_TEXT_DIR, applyImageReviews, applyTextReviews, loadImageReviews, loadTextReviews, trimReport } from './reviews.mjs';

export const SOURCES_DIR = join(CONTENT, 'sources');
export const CLUES_DIR = join(CONTENT, 'clues');
const MAPS_DIR = join(CONTENT, 'maps');
const PLONKIT_LICENCE = 'CC BY-NC-SA 4.0';
const LEARNABLE_META_LICENCE = 'Learnable Meta; notes partly from Plonk It (CC BY-NC-SA 4.0)';
/** Share of the smaller token set a meta's note must have in common with a clue's text to join it. */
const MERGE_THRESHOLD = 0.4;
/** Old Plonk It slugs Learnable Meta footers still link → the page's slug now. */
const SLUG_ALIASES = { 'united-states-of-america': 'united-states' };

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRegex = (word, flags = 'iu') => new RegExp(`(?<!\\p{L})${escape(word)}(?!\\p{L})`, flags);

export const stripMarkdown = (md) =>
  md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|[*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const firstSentence = (text) => stripMarkdown(text).split(/(?<=[.!?])\s+/)[0] ?? '';

// --- family and sign kind -------------------------------------------------------------------------

const TAG_FAMILY = {
  pole: 'pole',
  bollard: 'bollard',
  'chevron/sign': 'sign',
  guardrail: 'guardrail',
  roadline: 'line',
  'license plates': 'plate',
  coverage: 'coverage',
  language: 'language',
  architecture: 'architecture',
  landscape: 'landscape',
  vegetation: 'vegetation',
};

const SIGN_WORDS = [
  ['chevron', /\bchevrons?\b/i],
  ['stop', /\bstop signs?\b/i],
  ['giveway', /\b(give[ -]way|yield)\b/i],
  ['pedestrian', /\bpedestrians?\b/i],
  ['speed', /\bspeed limits?\b/i],
  ['warning', /\bwarning signs?\b/i],
  ['direction', /\bdirection(al)? signs?\b|\bsignposts?\b/i],
  ['route', /\broute (markers?|shields?|signs?|numbers?)\b|\broad number(s|ing)?\b/i],
  ['street', /\bstreet (name )?signs?\b|\bstreet names?\b/i],
  ['back', /\bsign backs?\b|\bbacks? of (the )?signs?\b/i],
];

const CAR = /\b(google|street view|google street view) cars?\b|\bcamera gen(eration)?\b|\bgen ?[1-4]\b|\bgeneration [1-4]\b|\bantennas?\b|\bsnorkel\b|\brack\b/i;

/** [family, regex] in priority order (a tie on position goes to the earlier one). */
const FAMILY_WORDS = [
  ['bollard', /\bbollards?\b/i],
  ['plate', /\b(?<!tectonic |pole )plates?\b/i],
  ['guardrail', /\bguard ?rails?\b|\bbarriers?\b/i],
  ...SIGN_WORDS.map(([, regex]) => ['sign', regex]),
  ['pole', /\b(utility )?poles?\b/i],
  ['line', /\b(road|centre|center|edge|lane|middle) ?lines?\b|\bdashed\b|\broad markings?\b/i],
  ['car', CAR],
  ['coverage', /\bcoverage\b|\btrekkers?\b/i],
  ['language', /\bscripts?\b|\balphabets?\b|\blanguages?\b|\bdiacritics?\b|\bletters\b/i],
  ['architecture', /\bhouses?\b|\broofs?\b|\barchitecture\b|\bbuildings?\b/i],
  ['vegetation', /\bvegetation\b|\btrees?\b|\bpalms?\b|\bforests?\b/i],
  ['landscape', /\blandscapes?\b|\bterrain\b|\bsoil\b|\bmountains?\b|\bhills?\b/i],
  ['sign', /\bsigns?\b/i],
];

/** The pattern matching earliest in `text` → its family (or key), or undefined. */
function earliest(text, patterns) {
  let best;
  for (const [key, regex] of patterns) {
    const index = text.search(regex);
    if (index >= 0 && (!best || index < best.index)) best = { key, index };
  }
  return best?.key;
}

/** Sign kind named in a text, or 'other'. */
export const signKind = (text) => earliest(stripMarkdown(text), SIGN_WORDS) ?? 'other';

/**
 * A clue's family (and sign kind): from its Plonk It tags first, then the keyword found earliest in
 * the first paragraph, then in the whole text, else 'other'.
 */
export function classify({ tags = [], text = [] }) {
  const all = text.join(' ');
  let family = tags.map((t) => TAG_FAMILY[t.toLowerCase()]).find(Boolean);
  if (family === 'coverage' && (CAR.test(all) || /\bblur/i.test(all))) family = 'car';
  family ??= earliest(stripMarkdown(text[0] ?? ''), FAMILY_WORDS) ?? earliest(stripMarkdown(all), FAMILY_WORDS) ?? 'other';
  if (family !== 'sign') return { family };
  const kind = signKind(all);
  return { family, kind: kind === 'other' && tags.includes('chevron/sign') ? 'chevron' : kind };
}

const LABELS = {
  bollard: 'Bollard',
  pole: 'Pole',
  line: 'Road line',
  guardrail: 'Guardrail',
  plate: 'Plate',
  car: 'Google car',
  coverage: 'Coverage',
  language: 'Language',
  architecture: 'Architecture',
  landscape: 'Landscape',
  vegetation: 'Vegetation',
};
const KIND_LABELS = {
  chevron: 'Chevron',
  stop: 'Stop sign',
  giveway: 'Give way sign',
  pedestrian: 'Pedestrian sign',
  speed: 'Speed sign',
  warning: 'Warning sign',
  direction: 'Direction sign',
  route: 'Route marker',
  street: 'Street sign',
  back: 'Sign back',
  other: 'Sign',
};

/** "<Family label>: <first clause of the first sentence>" (≤ ~60 chars); family 'other' has no label. */
export function clueTitle(family, kind, text = '') {
  const sentence = firstSentence(text);
  let clause = sentence.split(/[,;:(]|\s[-–—]\s/)[0];
  // a lead-in ("In the region of Extremadura,") says too little alone
  if (clause.split(/\s+/).length < 4) clause = sentence;
  clause = clause.replace(/[.!?]+$/, '').trim();
  if (clause.length > 60) clause = `${clause.slice(0, 60).replace(/\s+\S*$/, '')}…`;
  const label = family === 'sign' ? KIND_LABELS[kind ?? 'other'] : LABELS[family];
  return [label, clause].filter(Boolean).join(': ') || 'Clue';
}

// --- region and lookalikes ------------------------------------------------------------------------

const REGIONAL_STEP = /region|specific|island/i;
const ADMIN_WORDS =
  /\b(prefecture|province|oblast|region|county|voivodeship|state|governorate|district|department|krai|republic|autonomous|okrug|canton|parish|municipality|division|territory|of|the)\b/gi;
const GENERIC_REGION = new Set(['central', 'northern', 'southern', 'eastern', 'western', 'north', 'south', 'east', 'west', 'capital', 'coast']);

/** First-level region names of a country from content/maps, without "Province", "Oblast"… nor its own name. */
export function regionNames(code, countryName, mapsDir = MAPS_DIR) {
  const file = code === 'BR' ? 'br-states.json' : `${code.toLowerCase()}-regions.json`;
  const states = readJson(join(mapsDir, file), { states: [] }).states ?? [];
  const names = states.map((s) =>
    String(s.name ?? '').replace(/\([^)]*\)/g, '').replace(ADMIN_WORDS, '').replace(/\s+/g, ' ').trim(),
  );
  const own = fold(countryName).toLowerCase();
  return [...new Set(names)]
    .filter((n) => fold(n).length >= 4 && !GENERIC_REGION.has(fold(n).toLowerCase()) && fold(n).toLowerCase() !== own)
    .sort();
}

/**
 * The regions a clue is scoped to: only in a regional step, the region names (capitalised, whole
 * words) in its first sentence, in text order; nothing when there are none or more than 3.
 */
export function regionOf(stepTitle, text, names) {
  if (!REGIONAL_STEP.test(stepTitle) || !text) return undefined;
  const sentence = fold(firstSentence(text));
  const hits = names
    .map((name) => ({ name, index: sentence.search(wordRegex(fold(name), 'u')) }))
    .filter((h) => h.index >= 0)
    .filter((h, _, all) => !all.some((o) => o !== h && o.name.length > h.name.length && o.name.includes(h.name)))
    .sort((a, b) => a.index - b.index);
  return hits.length > 0 && hits.length <= 3 ? hits.map((h) => h.name).join(', ') : undefined;
}

/** Other names people (and Learnable Meta map names) use for pool countries. Upper-case ones match case-sensitively. */
const ALIASES = {
  US: ['United States of America', 'USA', 'US', 'Alaska', 'Hawaii'],
  GB: ['UK', 'Great Britain', 'Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland'],
  CZ: ['Czech Republic'],
  TR: ['Türkiye', 'Turkiye'],
  AE: ['UAE', 'Emirates'],
  MO: ['Macao'],
  BA: ['Bosnia'],
  KR: ['Korea'],
  CC: ['Cocos Islands', 'Keeling Islands'],
  FO: ['Faroes'],
  SZ: ['Swaziland'],
  PT: ['Azores', 'Madeira'],
  VI: ['U.S. Virgin Islands', 'United States Virgin Islands'],
  IL: ['West Bank'],
};
/** Only for meta names: as words in a text they mean something else too (Greek Macedonia). */
const PREFIX_ALIASES = { MK: ['Macedonia'] };

/** Pool codes of other countries a text names. "New Mexico", "North Korea"… do not count. */
export function lookalikesOf(text, code, pool) {
  const plain = fold(stripMarkdown(text));
  const found = new Set();
  for (const c of pool) {
    if (c.code === code || (c.code === 'GE' && code === 'US')) continue; // Georgia the US state
    const words = [c.name, ...(ALIASES[c.code] ?? [])];
    const hit = words.some((w) => {
      const caseSensitive = w === w.toUpperCase();
      const regex = new RegExp(`(?<!\\p{L})(?<!(new|north|northern|south) )${escape(fold(w))}(?!\\p{L})`, caseSensitive ? 'u' : 'iu');
      return regex.test(plain);
    });
    if (hit) found.add(c.code);
  }
  return [...found].sort();
}

/** Folded, lower-case country name or alias → pool code, for Learnable Meta's "<Country> - <Thing>". */
export function countryLookup(pool) {
  const lookup = new Map();
  for (const c of pool) {
    for (const w of [c.name, ...(ALIASES[c.code] ?? []), ...(PREFIX_ALIASES[c.code] ?? [])]) lookup.set(fold(w).toLowerCase(), c.code);
  }
  return lookup;
}

export function splitMetaName(name) {
  const [prefix, ...rest] = name.split(/\s+[-–—]\s+/);
  return { prefix: prefix.trim(), thing: rest.join(' - ').trim() };
}

// --- images ---------------------------------------------------------------------------------------

const GIVEAWAY_FILE = /map|summary|region|distribution/i;

/** The Street View spot of an image link: a long Google Maps URL, or a short one resolved in `links`. */
export function locationOf(link, links = {}) {
  if (!isMapsLink(link)) return undefined;
  const url = isShortLink(link) ? links[link]?.url : link;
  return url ? parseMapsUrl(url) : undefined;
}

export function clueImage(src, { link, links, text = '', source }) {
  const file = decodeURIComponent(new URL(src).pathname.split('/').pop() ?? '');
  const location = locationOf(link, links);
  return {
    id: mediaId(src),
    src,
    ...((GIVEAWAY_FILE.test(file) || /\bmaps?\b/i.test(stripMarkdown(text))) && { giveaway: true }),
    ...(location && { location: { ...location, source } }),
  };
}

const locationKey = (l) => l.pano ?? `${l.lat},${l.lng},${l.heading}`;
function uniqueLocations(images) {
  const seen = new Map();
  for (const { location } of images) if (location && !seen.has(locationKey(location))) seen.set(locationKey(location), location);
  return [...seen.values()];
}

// --- Learnable Meta notes -------------------------------------------------------------------------

/** A meta's HTML note → markdown paragraphs: tags stripped, <strong>/<b> kept as **bold**. */
export function noteToMarkdown(html = '') {
  return html
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_, __, inner) => (stripHtml(inner) ? `**${stripHtml(inner)}**` : ' '))
    .split(/<\/p>|<\/li>|<\/div>|<br\s*\/?>|\n\s*\n/i)
    .map((part) => stripHtml(part))
    .filter(Boolean);
}

const STOPWORDS = new Set(
  'that this with have from they there these those which often also more some than their been will when where very most only other into such like usually sometimes found common commonly country countries'.split(' '),
);
const tokens = (text) => new Set(fold(stripMarkdown(text)).toLowerCase().match(/\p{L}{4,}/gu)?.filter((t) => !STOPWORDS.has(t)) ?? []);

/** Overlap of two texts' tokens, as a share of the smaller set (0..1). */
export function similarity(a, b) {
  const [x, y] = [tokens(a), tokens(b)];
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / Math.min(x.size, y.size);
}

// --- sources --------------------------------------------------------------------------------------

/** Reads content/sources (or a copy): Plonk It pages, Learnable Meta maps, GeoHints and resolved links. */
export function loadSources(dir = SOURCES_DIR) {
  const plonkitDir = join(dir, 'plonkit');
  const lmDir = join(dir, 'learnablemeta');
  return {
    pages: jsonFilesIn(plonkitDir)
      .filter((f) => !f.startsWith('_'))
      .map((f) => readJson(join(plonkitDir, f)))
      .filter((raw) => Array.isArray(raw?.data?.public?.steps) && typeof raw.data.public.code === 'string'),
    maps: jsonFilesIn(lmDir)
      .filter((f) => f !== 'maps.json')
      .map((f) => readJson(join(lmDir, f)))
      .filter((m) => Array.isArray(m?.metas)),
    geohints: loadGeoHints(join(dir, 'geohints')),
    links: readJson(join(dir, 'links.json'), {}),
  };
}

/** Where a Plonk It page goes: its own pool country, or (US-AK, PT-AZ…) its parent's as a region. */
export function targetOf(code, poolCodes) {
  if (poolCodes.has(code)) return { country: code };
  const parent = code.split('-')[0];
  if (code.includes('-') && poolCodes.has(parent)) return { country: parent, sub: true };
  return undefined;
}

function addPage(country, raw, { pool, links, names, sub }) {
  const page = raw.data.public;
  const prefix = page.code.toLowerCase();
  const credit = { source: 'Plonk It', url: `${PLONKIT}/${page.slug}`, licence: PLONKIT_LICENCE };
  for (const step of page.steps) {
    const clues = [];
    const stepIndex = country.steps.length;
    (step.items ?? []).forEach((item, order) => {
      if (item.kind !== 'tip' || !item.id) return;
      const text = (item.data?.text ?? []).filter((t) => typeof t === 'string' && t.trim());
      const imageUrl = item.data?.image?.imageUrl;
      if (text.length === 0 && !imageUrl) return;
      const tags = (item.tags ?? []).filter((t) => typeof t === 'string');
      const { family, kind } = classify({ tags, text });
      const all = text.join('\n');
      const images = imageUrl ? [clueImage(new URL(imageUrl, PLONKIT).href, { link: item.data.image.imageLink, links, text: all, source: 'plonkit' })] : [];
      const region = sub ? page.title : regionOf(step.title ?? '', text[0], names);
      clues.push({
        id: `${prefix}-${item.id}`,
        step: stepIndex,
        order,
        family,
        ...(kind && { kind }),
        title: clueTitle(family, kind, text[0]),
        text,
        ...(region && { region }),
        tags,
        images,
        locations: uniqueLocations(images),
        lookalikes: lookalikesOf(all, country.country, pool),
        credit,
      });
    });
    if (clues.length === 0) continue;
    const title = String(step.title ?? '');
    country.steps.push({ title: sub && !title.includes(page.title) ? `${page.title}: ${title}` : title });
    country.clues.push(...clues);
  }
}

/** Every distinct meta (first map by id wins) with its country, or listed as unmatched. */
function metasByCountry(maps, lookup) {
  const seen = new Set();
  const out = [];
  const unmatched = {};
  for (const map of [...maps].sort((a, b) => String(a.geoguessrId).localeCompare(String(b.geoguessrId)))) {
    for (const meta of map.metas) {
      const key = String(meta.id);
      if (seen.has(key)) continue;
      seen.add(key);
      const { prefix, thing } = splitMetaName(meta.name);
      const code = lookup.get(fold(prefix).toLowerCase());
      if (code) out.push({ code, thing: thing || meta.name, meta, map });
      else unmatched[prefix] = (unmatched[prefix] ?? 0) + 1;
    }
  }
  const byId = (a, b) => (Number(a.meta.id) - Number(b.meta.id)) || String(a.meta.id).localeCompare(String(b.meta.id));
  return { metas: out.sort((a, b) => a.code.localeCompare(b.code) || byId(a, b)), unmatched };
}

/** Adds a meta to its country: its images onto the matching Plonk It clue, else as its own clue. */
function addMeta(country, { thing, meta, map }, { pool, slugs }) {
  const mapUrl = `${LEARNABLE_META}/maps/${map.geoguessrId}`;
  const text = noteToMarkdown(meta.note);
  const noteText = text.join('\n');
  // only into a clue of the meta's own country, and only when the footer links that country's page
  const linksPlonkit = [...meta.footer.matchAll(/plonkit\.net\/([\w-]+)/gi)].some((m) => slugs.has(SLUG_ALIASES[m[1].toLowerCase()] ?? m[1].toLowerCase()));
  const thingFamily = classify({ text: [thing] }).family;
  const images = meta.images.map((src) => clueImage(src, { text: noteText, source: 'learnablemeta' }));

  if (linksPlonkit && thingFamily !== 'other') {
    const best = country.clues
      .filter((c) => c.credit.source === 'Plonk It' && c.family === thingFamily)
      .map((clue) => ({ clue, score: similarity(noteText, clue.text.join('\n')) }))
      .sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= MERGE_THRESHOLD) {
      const have = new Set(best.clue.images.map((i) => i.src));
      best.clue.images.push(...images.filter((i) => !have.has(i.src)));
      return 'merged';
    }
  }

  let step = country.steps.findIndex((s) => s.title === 'Learnable Meta');
  if (step < 0) step = country.steps.push({ title: 'Learnable Meta' }) - 1;
  const { family, kind } = thingFamily !== 'other' ? classify({ text: [thing] }) : classify({ text: [thing, ...text] });
  country.clues.push({
    id: `${country.country.toLowerCase()}-lm-${meta.id}`,
    step,
    order: country.clues.filter((c) => c.step === step).length,
    family,
    ...(kind && { kind }),
    title: clueTitle(family, kind, thing),
    text,
    tags: [],
    images,
    locations: [],
    lookalikes: lookalikesOf(noteText, country.country, pool),
    credit: { source: 'Learnable Meta', url: mapUrl, licence: LEARNABLE_META_LICENCE },
  });
  return 'added';
}

/**
 * Sources → { countries: ClueCountry[] (sorted by code), unmatched: { "<meta name prefix>": count },
 * geohintsUnmatched: { "<GeoHints country name>": items }, counts }. `only` (upper-case codes) limits
 * the countries built.
 */
export function buildClues({ pages, maps, links, geohints = { items: [] } }, { pool = loadPool(), mapsDir = MAPS_DIR, only } = {}) {
  const poolCodes = new Set(pool.map((c) => c.code));
  const wanted = (code) => !only || only.includes(code);
  const byCode = new Map();
  const slugsOf = new Map();
  const country = (code, init) => {
    if (!byCode.has(code)) byCode.set(code, { country: code, name: pool.find((c) => c.code === code).name, ...init, steps: [], clues: [] });
    return byCode.get(code);
  };

  const placed = pages
    .map((raw) => ({ raw, target: targetOf(raw.data.public.code, poolCodes) }))
    .filter((p) => p.target && wanted(p.target.country))
    // own pages first, so a parent's steps come before its sub-territories'
    .sort((a, b) => Number(Boolean(a.target.sub)) - Number(Boolean(b.target.sub)) || a.raw.data.public.slug.localeCompare(b.raw.data.public.slug));
  for (const { raw, target } of placed) {
    const page = raw.data.public;
    const entry = country(target.country, {
      sourceUrl: `${PLONKIT}/${page.slug}`,
      ...(page.updatedAt && { updatedAt: page.updatedAt }),
      fetchedAt: raw.fetchedAt ?? page.updatedAt ?? '',
    });
    if (!slugsOf.has(target.country)) slugsOf.set(target.country, new Set());
    slugsOf.get(target.country).add(page.slug.toLowerCase());
    addPage(entry, raw, { pool, links, names: regionNames(target.country, entry.name, mapsDir), sub: target.sub });
  }

  const { metas, unmatched } = metasByCountry(maps, countryLookup(pool));
  const counts = { merged: 0, added: 0 };
  for (const item of metas.filter((m) => wanted(m.code))) {
    const entry = country(item.code, { sourceUrl: `${LEARNABLE_META}/maps/${item.map.geoguessrId}`, fetchedAt: item.map.fetchedAt ?? '' });
    counts[addMeta(entry, item, { pool, slugs: slugsOf.get(item.code) ?? new Set() })]++;
  }

  const lookup = countryLookup(pool);
  const regionNamesOf = (code) => regionNames(code, pool.find((c) => c.code === code).name, mapsDir);
  const gh = buildGeoHints(geohints, { lookup, poolCodes, locate: (link) => locationOf(link, links), regionNamesOf });
  let geohintsAdded = 0;
  for (const code of [...gh.clues.keys()].sort().filter(wanted)) {
    const entry = country(code, { sourceUrl: GEOHINTS, fetchedAt: geohints.fetchedAt ?? '' });
    const step = entry.steps.push({ title: GEOHINTS_STEP }) - 1;
    gh.clues.get(code).forEach(({ id, ...clue }, order) => entry.clues.push({ id, step, order, ...clue }));
    geohintsAdded += gh.clues.get(code).length;
  }

  const countries = [...byCode.values()].sort((a, b) => a.country.localeCompare(b.country));
  return {
    countries,
    unmatched,
    geohintsUnmatched: gh.unmatched,
    counts: { metasMerged: counts.merged, metasAdded: counts.added, geohintsAdded },
  };
}

/** index.json row for a country. */
export function indexRow(c) {
  const families = {};
  for (const clue of c.clues) families[clue.family] = (families[clue.family] ?? 0) + 1;
  return {
    country: c.country,
    name: c.name,
    clues: c.clues.length,
    images: c.clues.reduce((n, clue) => n + clue.images.length, 0),
    families: Object.fromEntries(Object.entries(families).sort(([a], [b]) => a.localeCompare(b))),
  };
}

/**
 * The `clues` step: writes <code>.json for every built country and rebuilds index.json from every
 * file in `outDir`. A full run (no `only`) also removes files of countries no longer built. Image
 * `path`, `width` and `height` set by `clueimages` are kept for images whose src is unchanged. Then
 * the reviews (reviews.mjs) are applied and `dupeOf` is set from the image hashes of `imagedupes`
 * (lib/phash.mjs; across countries only among the countries built).
 */
export function writeClues({
  sourcesDir = SOURCES_DIR,
  outDir = CLUES_DIR,
  pool = loadPool(),
  mapsDir = MAPS_DIR,
  only,
  hashesFile = join(sourcesDir, 'imagehashes.json'),
  reviewImagesDir = REVIEW_IMAGES_DIR,
  reviewTextDir = REVIEW_TEXT_DIR,
} = {}) {
  const sources = loadSources(sourcesDir);
  const { countries, unmatched, geohintsUnmatched, counts } = buildClues(sources, { pool, mapsDir, only });
  const built = new Set(countries.map((c) => `${c.country.toLowerCase()}.json`));
  if (!only) for (const f of jsonFilesIn(outDir)) if (f !== 'index.json' && !built.has(f)) rmSync(join(outDir, f));
  for (const c of countries) keepCopies(c, readJson(join(outDir, `${c.country.toLowerCase()}.json`)));

  const codes = new Set(pool.map((c) => c.code));
  const reviews = {
    images: trimReport(applyImageReviews(countries, loadImageReviews(reviewImagesDir, codes))),
    text: trimReport(applyTextReviews(countries, loadTextReviews(reviewTextDir, codes))),
  };
  const poolCodes = new Set(pool.map((c) => c.code));
  const slugCountry = new Map();
  for (const raw of sources.pages) {
    const target = targetOf(raw.data.public.code, poolCodes);
    if (target) slugCountry.set(raw.data.public.slug.toLowerCase(), target.country);
  }
  const dupes = markDupes(countries, readJson(hashesFile, {}), slugCountry);

  for (const c of countries) writeJson(join(outDir, `${c.country.toLowerCase()}.json`), c);
  const index = jsonFilesIn(outDir)
    .filter((f) => f !== 'index.json')
    .map((f) => indexRow(readJson(join(outDir, f))));
  writeJson(join(outDir, 'index.json'), index);
  return {
    counts: {
      countries: countries.length,
      clues: countries.reduce((n, c) => n + c.clues.length, 0),
      images: index.reduce((n, r) => n + r.images, 0),
      located: countries.reduce((n, c) => n + c.clues.reduce((m, clue) => m + clue.images.filter((i) => i.location).length, 0), 0),
      ...counts,
      dupes: dupes.within + dupes.sameFile + dupes.crossCountry.filter((p) => p.resolved).length,
    },
    unmatched,
    geohintsUnmatched,
    reviews,
    dupes: { ...dupes, crossCountry: dupes.crossCountry.slice(0, 300), crossCountryCount: dupes.crossCountry.length },
  };
}

/** Carries the copied-image fields of the previous file over to the same images (same id and src). */
function keepCopies(country, previous) {
  const copied = new Map();
  for (const clue of previous?.clues ?? []) for (const i of clue.images) if (i.path) copied.set(`${i.id} ${i.src}`, i);
  for (const clue of country.clues) {
    clue.images = clue.images.map((i) => {
      const old = copied.get(`${i.id} ${i.src}`);
      return old ? { ...i, path: old.path, width: old.width, height: old.height } : i;
    });
  }
}

if (isMain(import.meta)) {
  const { sources = SOURCES_DIR, out = CLUES_DIR } = parseArgs();
  if (!existsSync(sources)) throw new Error(`no sources at ${sources}`);
  console.log(JSON.stringify(writeClues({ sourcesDir: sources, outDir: out }), null, 2));
}
