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

// Google car vs coverage, the two boxes clues most often land in by mistake:
// - car: what you see of the Street View vehicle and its rig: colour, antenna, rack, tape, snorkel,
//   mirrors, the bed or trailer, ATVs, boats, the driver, follow cars.
// - coverage: the picture itself: camera generation, smallcam / shitcam, trekkers, blur, smudges,
//   rifts and tints, and when and where it was taken (season, weather, extent).
// A camera generation named in passing ("newer hydrants seen in Gen 4") says nothing about either.
const COLOURS = 'white|black|grey|gray|silver|red|blue|green|yellow|orange|brown|beige|dark|light|purple|pink';
/** Words that can only mean the Street View car or its rig. */
const VEHICLE = new RegExp(
  [
    String.raw`\b(google|street ?view) (cars?|vehicles?|trucks?|pickups?)\b`,
    String.raw`\b(${COLOURS})(-| and | |-and-)?(${COLOURS})?( (generation|gen) ?[1-4])?( (google|street ?view))? (car|truck|pickup( truck)?|suv|van|vehicle|4x4|toyota)\b`,
    String.raw`\b(unique|rare|invisible|visible|special|distinct(ive)?|different|exposed|solid|boxy) (google |street ?view )?(cars?|trucks?|pickups?|vehicles?)\b`,
    String.raw`\bthis (unique |rare |distinct |special )?(google |street ?view )?(car|truck|pickup|vehicle)\b`,
    String.raw`(?<!radio |rooftop |tall |tv |television |phone )\bantennas?\b|\bsnorkels?\b|\broof ?racks?\b|\bmirrors?\b|\bbrake lights?\b|\btow(ing|bar)\b|\btrailers?\b`,
    String.raw`\b(piece|pieces|strip) of tape\b|\btape (on|at) (the )?(antenna|roof|car)\b|\btaped\b|\bfollow cars?\b|\batvs?\b|\bquad bikes?\b|\bsnowmobiles?\b(?! trails?)|\bstreet ?view (boat|bike|trike)s?\b`,
    String.raw`\bcamera (mount|rig|pole|bar)s?\b|\bopen trunk\b|\bbonnet\b`,
  ].join('|'),
  'i',
);
/** Words that usually mean the Street View car, but not enough to outweigh the scenery. */
const VEHICLE_WEAK =
  /\bthe (google |street ?view )?(car|truck|pickup|vehicle)('s)?\b|\b(car|truck|pickup|vehicle) (is|was|has|with|can be seen)\b|\bthe driver\b|\bthe bed\b|\bracks?\b|\btractors?\b/i;
/** Camera types and faults: named before the car, the clue is about the camera. */
const CAMERA_TYPE =
  /\bsmall ?cam\b|\bshit ?cam\b|\bofficial ari\b|\blow ?cam\b|\btrekkers?\b|\brifts?\b|\bsmudge[sd]?\b|\bglitch(es)?\b|\blow[- ]quality camera\b/i;
const CAMERA =
  /\b(generation|gen) ?[1-4]\b|\bgen[1-4]\b|\bcamera\b|\bsmall ?cam\b|\bshit ?cam\b|\bofficial ari\b|\blow ?cam\b|\btrekkers?\b|\bcoverage\b|\bblurs?\b|\bsmudge[sd]?\b|\brifts?\b|\btint(ed)?\b|\bglitch(es)?\b|\bcopyright\b|\bpanoramas?\b|\bstitching\b/i;

/** [family, regex] for what a clue is about, in priority order (a tie on position goes to the earlier one). */
const FAMILY_WORDS = [
  ['bollard', /\bbollards?\b/i],
  ['plate', /\b(?<!tectonic |pole |number |name |street )(licen[cs]e |number |car )?plates?\b/i],
  ['guardrail', /\bguard ?rails?\b|\bcrash barriers?\b|\bbarriers?\b/i],
  ...SIGN_WORDS.map(([, regex]) => ['sign', regex]),
  ['pole', /\b(utility |electricity |power |telephone |snow |wooden |concrete )?poles?\b|\binsulators?\b|\bpylons?\b/i],
  ['line', /\b(road|centre|center|edge|lane|middle|side|shoulder) ?lines?\b|\bdashed\b|\broad markings?\b/i],
  [
    'street',
    /\bkerbs?\b|\bcurbs?\b|\bstreet ?lights?\b|\blamp ?posts?\b|\blamps?\b|\bbus (stops?|shelters?|signs?)\b|\bbus stop signs?\b|\bbins?\b|\bhydrants?\b|\bmail ?box(es)?\b|\bpost ?box(es)?\b|\bletter ?box(es)?\b|\btraffic lights?\b|\bsidewalks?\b|\bpavements?\b|\bpotholes?\b|\basphalt\b|\bmanholes?\b|\bspeed bumps?\b|\bfences?\b|\bbridges?\b|\broad (diamond|surface|quality)s?\b|\bdirt roads?\b|\bgravel roads?\b|\bunpaved\b|\bbenches?\b|\bcobble(stones?|d)\b|\bconcrete (block )?roads?\b|\bdrainage ditch(es)?\b|\b(traffic|convex|junction|road) mirrors?\b|\bmirrors with (orange|yellow|red) hoods?\b/i,
  ],
  ['language', /\bscripts?\b|\balphabets?\b|\blanguages?\b|\bdiacritics?\b|\bletters\b|\bspelling\b|\bwords? for\b/i],
  ['architecture', /\bhouses?\b|\broofs?\b|\barchitecture\b|\bbuildings?\b|\bchimneys?\b|\bbarns?\b|\bhuts?\b|\bhouse numbers?\b|\bwalls\b|\bgates?\b/i],
  [
    'vegetation',
    /\bvegetation\b|\btrees?\b|\bpalms?\b|\bforests?\b|\bplants?\b|\bplantations?\b|\bcrops?\b|\bfields of\b|\brice\b|\bcorn\b|\bmaize\b|\bbananas?\b|\bsugar ?cane\b|\bcotton\b|\bwheat\b|\btea\b|\bcact(i|us)\b|\bagaves?\b|\bbushes\b|\bshrubs?\b|\bgrass\b|\beucalyptus\b|\bpines?\b|\bbirch(es)?\b|\bvineyards?\b|\borchards?\b/i,
  ],
  [
    'landscape',
    /\blandscapes?\b|\bterrain\b|\bsoil\b|\bmountains?\b|\bhills?\b|\bhilly\b|\bvolcan(o|oes|ic)\b|\brocks?\b|\brocky\b|\bdeserts?\b|\bridges?\b|\bvalleys?\b|\bbeach(es)?\b|\bcoast(line)?\b|\bsand(y)?\b|\bcliffs?\b|\bplains?\b|\bscenery\b|\blakes?\b|\brivers?\b|\bfjords?\b|\bdunes?\b|\bcanyons?\b/i,
  ],
  ['sign', /\bsigns?\b|\bsign ?posts?\b/i],
];

/** Traffic, not the Street View car: a clue about it only when it names nothing else. */
const TRAFFIC = [
  ['other', /\btaxis?\b|\bbuses\b|\bbus\b(?! stops?| shelters?)|\btrams?\b|\brickshaws?\b|\btuk[- ]?tuks?\b|\bsongthaews?\b|\bjeepneys?\b|\bsemi[- ]?trucks?\b|\bmotorbikes\b|\bscooters\b/i],
];

/** Families that name the scene rather than a thing in it. */
const BROAD = new Set(['landscape', 'vegetation']);

/** The pattern matching earliest in `text` → { key, index }, or undefined. */
function earliestAt(text, patterns) {
  let best;
  for (const [key, regex] of patterns) {
    const index = text.search(regex);
    if (index >= 0 && (!best || index < best.index)) best = { key, index };
  }
  return best;
}
const earliest = (text, patterns) => earliestAt(text, patterns)?.key;

/** Sign kind named in a text, or 'other'. */
export const signKind = (text) => earliest(stripMarkdown(text), SIGN_WORDS) ?? 'other';

/**
 * What one stretch of text is about: the Street View car when it names the car or its rig before
 * any other object; else the first object named (a bollard, a hydrant, rice fields…); else coverage
 * when it is about the camera or the coverage; else nothing.
 */
function aboutOf(text) {
  const plain = stripMarkdown(text);
  const object = earliestAt(plain, FAMILY_WORDS) ?? earliestAt(plain, TRAFFIC);
  const strong = plain.search(VEHICLE);
  const weak = plain.search(VEHICLE_WEAK);
  const vehicle = strong < 0 ? weak : weak < 0 ? strong : Math.min(strong, weak);
  const camera = plain.search(CAMERA);
  // scenery words ("along the coast", "in the mountains") set the scene more often than the subject
  const broad = object && BROAD.has(object.key);
  const cameraType = plain.search(CAMERA_TYPE);
  if (cameraType >= 0 && (vehicle < 0 || cameraType < vehicle) && (!object || broad || cameraType < object.index)) {
    return 'coverage';
  }
  if (vehicle >= 0 && (!object || vehicle < object.index || (broad && strong >= 0))) return 'car';
  if (object && !(broad && camera >= 0 && camera < object.index)) return object.key;
  if (camera >= 0) return 'coverage';
  return undefined;
}

/**
 * A clue's family (and sign kind). Plonk It's own tags decide, except its "coverage" tag, which
 * covers both the car and the coverage: the text tells them apart. Untagged, the first sentence
 * decides, then the first paragraph, then the whole text, else 'other'.
 */
export function classify({ tags = [], text = [] }) {
  const all = text.join(' ');
  const tagged = tags.map((t) => TAG_FAMILY[t.toLowerCase()]).filter(Boolean);
  const lead = firstSentence(text[0] ?? '');
  let family = tagged.find((f) => f !== 'coverage');
  if (tagged.includes('coverage')) {
    // "coverage" is Plonk It's tag for the car too; with a second tag, the text picks between them
    const about = aboutOf(lead) ?? aboutOf(text[0] ?? '');
    if (about === 'car') family = 'car';
    else if (about === 'coverage' || !family) family = tagged.includes(about) ? about : family ?? 'coverage';
  }
  family ??= aboutOf(lead) ?? aboutOf(text[0] ?? '') ?? aboutOf(all) ?? 'other';
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
  street: 'Street',
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

// --- settling families after review --------------------------------------------------------------

/** A reviewed title's lead word → its family, for clues the text alone could not place. */
const TITLE_FAMILY = Object.entries({
  bollard: ['bollard', 'bollards'],
  pole: ['pole', 'poles', 'insulator', 'insulators', 'snow pole', 'snow poles', 'guy wire', 'pole top', 'pole paint', 'pole marking', 'pole plate', 'pole tag', 'pole sticker', 'pole reflector'],
  plate: ['plate', 'plates', 'licence plates'],
  sign: ['sign', 'signs', 'route marker', 'marker', 'markers', 'km marker', 'kilometre marker', 'signpost', 'signposts', 'road numbers', 'route numbers', 'street sign', 'street signs'],
  line: ['road line', 'road lines'],
  guardrail: ['guardrail', 'guardrails'],
  language: ['language', 'town names', 'place names', 'town name ending', 'obituary'],
  car: ['google car', 'follow car', 'boat'],
  coverage: ['coverage', 'camera', 'hidden coverage', 'glitch'],
  street: ['streetlight', 'streetlights', 'lamp', 'lamps', 'lamp post', 'lamp posts', 'bus stop', 'bus stops', 'bin', 'bins', 'rubbish bin', 'kerb', 'kerbs', 'curbs', 'pavement', 'sidewalks', 'fence', 'fences', 'bridge', 'bridges', 'mailbox', 'post boxes', 'traffic lights', 'road arrow', 'road works', 'electricity meter', 'water tanks', 'road diamond'],
  architecture: ['houses', 'house', 'roofs', 'architecture', 'buildings', 'barns', 'walls', 'wall', 'huts', 'chimneys', 'house numbers', 'house number', 'roof ornament', 'gable horns'],
  vegetation: ['plants', 'crops', 'trees', 'palms', 'vegetation', 'farming', 'fields', 'farmland', 'rice'],
  landscape: ['landscape', 'soil', 'valley', 'bay', 'coast', 'beach', 'ground'],
}).reduce((map, [family, words]) => {
  for (const word of words) map.set(word, family);
  return map;
}, new Map());

/**
 * Title leads that only followed the old car / coverage mix-up, so they follow the family now. Any
 * other lead is the reviewer's own reading and stays.
 */
const LABEL_WORDS = new Set(['google car', 'coverage']);

/** Families drilled on their own, where a clue in the wrong one makes a false question. */
const NARROW = new Set(['bollard', 'pole', 'plate', 'guardrail', 'line']);

/**
 * After review: a clue still in 'other' takes the family its reviewed title names ("Pole: thick
 * grey trapezoid"), and a car or coverage clue whose title leads with the other one ("Google car:
 * autumn colours") gets its own label. → counts for the report.
 */
export function settleFamilies(countries) {
  const report = { fromTitle: 0, relabelled: 0 };
  for (const country of countries) {
    for (const clue of country.clues) {
      const [lead, ...rest] = clue.title.split(':');
      if (!rest.length) continue;
      const word = lead.trim().toLowerCase();
      const named = TITLE_FAMILY.get(word);
      // Drills of one narrow family (bollards, poles, plates, guardrails, lines) ask "Which is the
      // X bollard?": a clue whose reviewed title names another family ("Pole plate: …" read as a
      // plate, "Pole: wavy lamp posts" read as landscape) follows its title
      if (named && named !== clue.family && (NARROW.has(named) || NARROW.has(clue.family))) {
        clue.family = named;
        if (named === 'sign') clue.kind = signKind(`${clue.title} ${clue.text.join(' ')}`);
        else delete clue.kind;
        report.fromTitle++;
        continue;
      }
      if (clue.family === 'other' && named) {
        clue.family = named;
        if (named === 'sign') clue.kind = signKind(`${clue.title} ${clue.text.join(' ')}`);
        report.fromTitle++;
        continue;
      }
      const label = LABELS[clue.family];
      if (label && LABEL_WORDS.has(word) && ['car', 'coverage'].includes(clue.family) && named !== clue.family) {
        clue.title = `${label}:${rest.join(':')}`;
        report.relabelled++;
      }
    }
  }
  return report;
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
  const families = settleFamilies(countries);
  const poolCodes = new Set(pool.map((c) => c.code));
  const slugCountry = new Map();
  for (const raw of sources.pages) {
    const target = targetOf(raw.data.public.code, poolCodes);
    if (target) slugCountry.set(raw.data.public.slug.toLowerCase(), target.country);
  }
  const dupes = markDupes(countries, readJson(hashesFile, {}), slugCountry);
  const sameLook = addSameLook(countries, dupes.crossCountry);
  const regionCodes = addRegionCodes(countries, mapsDir);

  for (const c of countries) writeJson(join(outDir, `${c.country.toLowerCase()}.json`), c);
  const index = jsonFilesIn(outDir)
    .filter((f) => f !== 'index.json')
    .map((f) => indexRow(readJson(join(outDir, f))));
  writeJson(join(outDir, 'index.json'), index);
  return {
    families,
    counts: {
      countries: countries.length,
      clues: countries.reduce((n, c) => n + c.clues.length, 0),
      images: index.reduce((n, r) => n + r.images, 0),
      located: countries.reduce((n, c) => n + c.clues.reduce((m, clue) => m + clue.images.filter((i) => i.location).length, 0), 0),
      ...counts,
      dupes: dupes.within + dupes.sameFile + dupes.crossCountry.filter((p) => p.resolved).length,
      sameLook,
      regionCodes,
    },
    unmatched,
    geohintsUnmatched,
    reviews,
    dupes: { ...dupes, crossCountry: dupes.crossCountry.slice(0, 300), crossCountryCount: dupes.crossCountry.length },
  };
}

/**
 * A regional clue whose region is exactly one region of the country's map gets that region's code
 * (`regionCode`), so the app can ask it where it belongs: "Where in the US?" on the map, rather
 * than only "Which country?". Regions that name several map regions, or none, get no code.
 * Returns the number of clues given a code.
 */
const BROAD_FAMILIES = new Set(['landscape', 'vegetation']);

export function addRegionCodes(countries, mapsDir = MAPS_DIR) {
  const norm = (s) => fold(String(s)).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  let given = 0;
  for (const country of countries) {
    const file = country.country === 'BR' ? 'br-states.json' : `${country.country.toLowerCase()}-regions.json`;
    const states = readJson(join(mapsDir, file), { states: [] }).states ?? [];
    if (states.length === 0) continue;
    for (const clue of country.clues) {
      delete clue.regionCode;
      delete clue.alsoRegions;
      // landscape and plants run across regions ("the Great Plains, to central Texas"): no single answer
      if (!clue.region || BROAD_FAMILIES.has(clue.family)) continue;
      const region = norm(clue.region);
      const hits = states.filter((s) => norm(s.name ?? '') === region);
      if (hits.length === 1) {
        clue.regionCode = hits[0].code;
        const also = alsoNamed(clue, states, hits[0].code, norm);
        if (also.length) clue.alsoRegions = also;
        given++;
      }
    }
  }
  return given;
}

/**
 * Other regions of the map a clue names in its title, summary or text, by name ("Tarragona") or,
 * where the map's codes are letters, by code as written ("RS, RJ, MS"): a map question accepts them.
 */
function alsoNamed(clue, states, own, norm) {
  const text = [clue.title ?? '', clue.summary ?? '', ...(clue.text ?? [])].join(' ');
  const words = ` ${norm(text)} `;
  return states
    .filter((s) => s.code !== own)
    .filter((s) => {
      const name = norm(s.name ?? '');
      if (name.length > 3 && words.includes(` ${name} `)) return true;
      return /^[A-Z]{2,3}$/.test(s.code) && new RegExp(`\\b${s.code}\\b`).test(text);
    })
    .map((s) => s.code)
    .sort();
}

/**
 * The same picture in two countries' clues (an identical sign drawing, say) means the clue looks the same
 * there: each clue gets the other country in `sameAs`, so the two are never quizzed against each other.
 * Returns the number of clues that gained a country.
 */
export function addSameLook(countries, pairs) {
  const clues = new Map(countries.flatMap((c) => c.clues.map((clue) => [clue.id, clue])));
  const touched = new Set();
  const add = (clueId, other, own) => {
    const clue = clues.get(clueId);
    if (!clue || other === own || clue.sameAs?.includes(other)) return;
    clue.sameAs = [...(clue.sameAs ?? []), other].sort();
    touched.add(clueId);
  };
  for (const p of pairs) {
    if (p.resolved) continue;
    add(p.clueId, p.of.country, p.country);
    add(p.of.clueId, p.country, p.of.country);
  }
  return touched.size;
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
