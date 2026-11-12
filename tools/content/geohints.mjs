// GeoHints (https://geohints.com) → one clue per country and category, in a "More from GeoHints" step
// after the country's Plonk It and Learnable Meta clues. The pages were saved once from a browser into
// content/sources/geohints: data.json ({ cats: { "/meta/<category>": { title, items: [{ t, img, maps }] } } },
// t[0] = country) and signs.json ({ cats: { "/meta/signs/<type>": [{ country, img, maps, t }] } }).
// Used with the owner's permission for personal study, with credit. Pure: the `clues` step calls it.
import { join } from 'node:path';
import { CONTENT, mediaId, readJson } from './lib/common.mjs';

export const GEOHINTS = 'https://geohints.com';
export const GEOHINTS_DIR = join(CONTENT, 'sources', 'geohints');
export const GEOHINTS_STEP = 'More from GeoHints';
const LICENCE = 'GeoHints; used with credit for personal study';
const MAX_LIST = 12;

/**
 * The categories used, in step order. `layout` says what the labels after the country are:
 * vehicle = camera tags (Gen 3, Antenna…) and regions; plate = region slot, then plate type and years;
 * species = plant name, then notes or regions; value = a sign's value (speed, animal…), then regions;
 * region = regions, unless they read like a note; mapped = a region only when it names one of the
 * country's regions (content/maps), else a note.
 */
export const CATEGORIES = [
  { path: 'bollards', family: 'bollard', title: 'Bollard: more examples', noun: 'Bollard', plural: 'Bollards', layout: 'region' },
  { path: 'utilityPoles', family: 'pole', title: 'Pole: more examples', noun: 'Utility pole', plural: 'Utility poles', layout: 'region', more: 'poles' },
  { path: 'architecture', family: 'architecture', title: 'Architecture: more examples', noun: 'House', plural: 'Buildings', layout: 'mapped' },
  { path: 'nature', family: 'vegetation', title: 'Vegetation: plants and trees', noun: 'Plant', plural: 'Plants', layout: 'species' },
  { path: 'sceneries', family: 'landscape', title: 'Landscape: scenery', noun: 'Scenery', plural: 'Landscapes', layout: 'region' },
  { path: 'licensePlates', family: 'plate', title: 'Plate: more examples', noun: 'Licence plate', plural: 'Licence plates', layout: 'plate' },
  { path: 'googleVehicles/cars', family: 'car', title: 'Google car: more examples', noun: 'car', plural: 'Google cars', layout: 'vehicle' },
  { path: 'followCars', family: 'car', title: 'Google car: follow cars', noun: 'Follow car', plural: 'Follow cars', layout: 'mapped' },
  { path: 'googleVehicles/boats', family: 'car', title: 'Google car: boats', noun: 'boat', plural: 'Street View boats', layout: 'vehicle' },
  { path: 'googleVehicles/atvs', family: 'car', title: 'Google car: ATVs', noun: 'ATV', plural: 'Street View ATVs', layout: 'vehicle' },
  { path: 'googleVehicles/snowmobiles', family: 'car', title: 'Google car: snowmobiles', noun: 'snowmobile', plural: 'Street View snowmobiles', layout: 'vehicle' },
  { path: 'googleVehicles/trains', family: 'car', title: 'Google car: trains', noun: 'train', plural: 'Street View trains', layout: 'vehicle' },
  { path: 'googleVehicles/motorcycles', family: 'car', title: 'Google car: motorcycles', noun: 'motorcycle', plural: 'Street View motorcycles', layout: 'vehicle' },
  { path: 'googleVehicles/cableCars', family: 'car', title: 'Google car: cable cars', noun: 'cable car', plural: 'Street View cable cars', layout: 'vehicle' },
  { path: 'googleVehicles/animals', family: 'car', title: 'Google car: animals', noun: 'camera on an animal', plural: 'Street View cameras on animals', layout: 'vehicle' },
  { path: 'googleVehicles/others', family: 'car', title: 'Google car: other vehicles', noun: 'vehicle', plural: 'Other Street View vehicles', layout: 'vehicle' },
  { path: 'rifts', family: 'coverage', title: 'Coverage: rifts', noun: 'Rift', plural: 'Coverage rifts', layout: 'region' },
  { path: 'houseNumbers', family: 'architecture', title: 'House numbers', noun: 'House number', plural: 'House numbers', layout: 'region' },
  { path: 'postBoxes', family: 'street', title: 'Post boxes', noun: 'Post box', plural: 'Post boxes', layout: 'region' },
  { path: 'sidewalks', family: 'street', title: 'Sidewalks', noun: 'Sidewalk', plural: 'Sidewalks', layout: 'region' },
  { path: 'signs/stop', kind: 'stop', title: 'Stop sign: design', noun: 'Stop sign', plural: 'Stop signs', layout: 'region' },
  { path: 'signs/yield', kind: 'giveway', title: 'Give way sign: design', noun: 'Give way sign', plural: 'Give way signs', layout: 'region' },
  { path: 'signs/chevrons', kind: 'chevron', title: 'Chevron: design', noun: 'Chevron', plural: 'Chevrons', layout: 'region' },
  { path: 'signs/pedestrian', kind: 'pedestrian', title: 'Pedestrian sign: design', noun: 'Pedestrian crossing sign', plural: 'Pedestrian signs', layout: 'region' },
  { path: 'signs/speed', kind: 'speed', title: 'Speed sign: design', noun: 'Speed limit', plural: 'Speed limit signs', layout: 'value', caption: (v) => `Speed limit ${v}` },
  { path: 'signs/animalWarning', kind: 'warning', title: 'Warning sign: animals', noun: 'Animal warning sign', plural: 'Animal warning signs', layout: 'value', caption: (v) => `${v} warning sign` },
  { path: 'signs/railwayCrossing', kind: 'warning', title: 'Warning sign: railway crossings', noun: 'Railway crossing sign', plural: 'Railway crossing signs', layout: 'value', caption: (v) => `Railway crossing sign (${v})` },
  { path: 'signs/river', kind: 'warning', title: 'Warning sign: rivers', noun: 'River sign', plural: 'River signs', layout: 'region' },
  { path: 'signs/backOfSigns', kind: 'back', title: 'Sign back: design', noun: 'Sign back', plural: 'Sign backs', layout: 'region' },
  { path: 'signs/directions', kind: 'direction', title: 'Direction sign: design', noun: 'Direction sign', plural: 'Direction signs', layout: 'region' },
  { path: 'signs/signPosts', kind: 'direction', title: 'Direction sign: posts', noun: 'Sign post', plural: 'Sign posts', layout: 'region' },
  { path: 'signs/roadNumbering', kind: 'route', title: 'Route marker: design', noun: 'Route marker', plural: 'Route markers', layout: 'region' },
  { path: 'signs/streetNames', kind: 'street', title: 'Street sign: design', noun: 'Street name sign', plural: 'Street name signs', layout: 'region' },
  { path: 'signs/citySigns', kind: 'street', title: 'Street sign: town names', noun: 'Town sign', plural: 'Town signs', layout: 'region' },
  { path: 'signs/busStop', kind: 'other', title: 'Sign: bus stops', noun: 'Bus stop sign', plural: 'Bus stop signs', layout: 'region' },
  { path: 'signs/tramSpeed', kind: 'other', title: 'Sign: tram speed limits', noun: 'Tram speed limit', plural: 'Tram speed signs', layout: 'value', caption: (v) => `Tram speed limit ${v}` },
  { path: 'signs/tramStop', kind: 'other', title: 'Sign: tram stops', noun: 'Tram stop sign', plural: 'Tram stop signs', layout: 'region' },
].map((c) => ({ ...c, family: c.family ?? 'sign', slug: c.path.toLowerCase().replace(/\//g, '-') }));

/** GeoHints country names that are no pool name or alias: → pool code, and the region they stand for. */
const NAMES = {
  'Åland': { code: 'FI', region: 'Åland' },
  'Svalbard and Jan Mayen': { code: 'SJ' },
};

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** A GeoHints country name → { code, region? } in the pool, or undefined. */
export function geohintsCountry(name, lookup, poolCodes) {
  if (NAMES[name]) return poolCodes.has(NAMES[name].code) ? NAMES[name] : undefined;
  const code = lookup.get(fold(name));
  return code && poolCodes.has(code) ? { code } : undefined;
}

/**
 * Reads content/sources/geohints (or a copy) → { fetchedAt, items: [{ category, country, t, img, maps }],
 * lines: [{ type, countries }] }. more.json holds pages fetched later: { poles: [{ t, img, maps }], lines: { text } }.
 */
export function loadGeoHints(dir = GEOHINTS_DIR) {
  const data = readJson(join(dir, 'data.json'), { cats: {} });
  const signs = readJson(join(dir, 'signs.json'), { cats: {} });
  const more = readJson(join(dir, 'more.json'), {});
  const items = [];
  for (const category of CATEGORIES) {
    const key = `/meta/${category.path}`;
    for (const x of category.more ? (more[category.more] ?? []) : []) if (x?.t?.[0]) items.push({ category, country: x.t[0], t: x.t.slice(1), img: x.img, maps: x.maps });
    if (category.family === 'sign') {
      for (const x of signs.cats?.[key] ?? []) if (x?.country) items.push({ category, country: x.country, t: x.t ?? [], img: x.img, maps: x.maps });
    } else {
      for (const x of data.cats?.[key]?.items ?? []) if (x?.t?.[0]) items.push({ category, country: x.t[0], t: x.t.slice(1), img: x.img, maps: x.maps });
    }
  }
  return {
    fetchedAt: signs.fetchedAt ?? data.fetchedAt ?? '',
    items: items.filter((i) => /^https?:\/\//.test(i.img ?? '') && !/\/logos\/logo\.svg$/.test(i.img)),
    lines: parseLines(more.lines?.text ?? ''),
  };
}

const LINE_TYPE = /^Outside:\s*(.+?)\s*\|\s*Inside:\s*(.+?)\s*$/;
// the page's continent index follows the colour sections
const CONTINENTS = new Set(['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America']);
const LINE_UI = new Set(['+', '−', 'Lines', 'Hover over a country', 'no data', 'Leaflet', 'GeoHints Shop']);

/**
 * The innerText of geohints.com/meta/lines → [{ type: "Outside: Yellow | Inside: White", countries }].
 * A type line is followed by the countries using it (the first sections repeat the type line after the map's
 * UI strings); a type seen twice is merged, countries are listed once, in page order.
 */
export function parseLines(text) {
  const groups = new Map();
  let current;
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\u200c/g, '').trim();
    if (!line || LINE_UI.has(line)) continue;
    if (CONTINENTS.has(line)) break;
    const m = LINE_TYPE.exec(line);
    if (m) {
      const type = `Outside: ${m[1]} | Inside: ${m[2]}`;
      if (!groups.has(type)) groups.set(type, []);
      current = groups.get(type);
    } else if (current && !current.includes(line)) current.push(line);
  }
  return [...groups].map(([type, countries]) => ({ type, countries }));
}

/** "Outside: Yellow | Inside: White and yellow" → { outer: "yellow", inner: "white and yellow", slug }. */
export function lineType(type) {
  const m = LINE_TYPE.exec(type);
  const outer = m[1].toLowerCase();
  const inner = m[2].toLowerCase();
  return { outer, inner, slug: `${outer}-${inner}`.replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') };
}

/** Every link of a GeoHints image (all are Google Maps links), sorted. */
export function geohintsImageLinks(dir = GEOHINTS_DIR) {
  const links = new Set();
  for (const { maps } of loadGeoHints(dir).items) if (/^https?:\/\//.test(maps ?? '')) links.add(maps);
  return [...links].sort();
}

// a line break inside a word ("f\nlowers") is the site's wrapping, not a space
const clean = (label) => String(label ?? '').replace(/\u200c/g, '').replace(/(\p{Ll})\n(\p{Ll})/gu, '$1$2').replace(/\s+/g, ' ').trim();
const CAMERA_TAG = /^(gen [1-4]|antenna|bad cam|roof rack|small cam|low cam|snorkel)$/i;
const NOTE_LIKE = /[.!?]|^(old|km only|only|on |end |mainly|most|specific|cute|these|square|invasive|typical|western|eastern|northern|southern|central and)\b|\d{4}|present/i;

/**
 * Sorts one item's labels (after the country) into { labels, regions, notes, tags } by its category's
 * layout. `isRegion(label)` says whether a label names one of the country's regions.
 */
export function readLabels(category, t, isRegion = () => false) {
  const raw = t.map(clean);
  const out = { labels: [], regions: [], notes: [], tags: [] };
  const regionLike = (part, loose) => isRegion(part) || (loose && !NOTE_LIKE.test(part) && part.split(' ').length <= 4);
  const regionOrNote = (label, loose) => {
    // "Nevada, Utah": every part a region
    if (label.split(/,\s*/).every((part) => regionLike(part, loose))) out.regions.push(label);
    else if (category.family === 'sign' || label.length <= 40) out.labels.push(label);
    else out.notes.push(label);
  };
  raw.forEach((label, i) => {
    if (!label || label === 'Buy') return;
    if (category.layout === 'vehicle') {
      if (CAMERA_TAG.test(label)) out.tags.push(label);
      else out.regions.push(label);
    } else if (category.layout === 'plate') {
      if (i === 0) out.regions.push(label);
      else out.labels.push(label);
    } else if (category.layout === 'species' || category.layout === 'value') {
      if (i === 0) out.labels.push(label);
      else regionOrNote(label, category.layout === 'value');
    } else regionOrNote(label, category.layout === 'region');
  });
  return out;
}

export const isSvgUrl = (src) => /\.svg([?#]|$)/i.test(src);
const lowerFirst = (s) => (/^(Google|Street View|ATV)\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const cap = (s, max) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`);

/** One plain caption for an item, e.g. "Gen 3 car (antenna), Alaska", "Speed limit 30", "Sign design: stop sign". */
export function itemCaption(category, { labels, regions, tags }, src) {
  let base;
  if (category.layout === 'vehicle') {
    const gen = tags.find((t) => /^gen/i.test(t));
    const others = tags.filter((t) => t !== gen).map((t) => t.toLowerCase());
    base = `${gen ? `${gen} ` : ''}${category.noun}${others.length ? ` (${others.join(', ')})` : ''}`;
  } else if (category.layout === 'value' && labels[0]) base = category.caption(labels[0]);
  else if (category.layout === 'species' && labels[0]) base = labels[0];
  else base = `${category.noun}${labels.length ? ` (${labels.join(', ')})` : ''}`;
  if (regions.length) base += `, ${regions.join(', ')}`;
  base = base.charAt(0).toUpperCase() + base.slice(1);
  return cap(isSvgUrl(src) ? `Sign design: ${lowerFirst(base)}` : base, 200);
}

/** "a (3), b (2), c": distinct values by count, then name; numbers in numeric order when all are numbers. */
function countList(values, max = MAX_LIST, withCounts = true) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  // speed values ("30", "40 Exit") in number order, other labels by count
  const numeric = [...counts.keys()].every((v) => /^\d/.test(v));
  const byNumber = (a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b);
  const keys = [...counts.keys()].sort((a, b) => (numeric ? byNumber(a, b) : counts.get(b) - counts.get(a) || a.localeCompare(b)));
  const shown = keys.slice(0, max).map((k) => (withCounts && counts.get(k) > 1 ? `${k} (${counts.get(k)})` : k));
  return `${shown.join(', ')}${keys.length > max ? ` and ${keys.length - max} more` : ''}`;
}

/** The short plain summary of a country's clue of one category. */
export function clueSummary(category, items) {
  const labels = items.flatMap((i) => (category.layout === 'vehicle' ? i.tags : i.labels));
  const anyRegion = items.some((i) => i.regions.length);
  if (category.layout === 'value' && labels.length) {
    // speed signs: just the numbers ("40 Exit" → 40)
    const numbers = labels.map((l) => /^\d+/.exec(l)?.[0]).filter(Boolean);
    return cap(`${category.plural} seen here: ${countList(numbers.length ? numbers : labels, MAX_LIST, false)}.`, 300);
  }
  const list =
    category.layout === 'species' ? labels.map((l) => l.replace(/\s*\(.*$/, '')) : category.layout === 'plate' ? labels.filter((l) => !/\d/.test(l)) : labels;
  const what = list.length ? ` (${countList(list, 8, false)})` : '';
  return cap(`${category.plural} you can see here${what}${anyRegion ? '; regional ones are tagged by region' : ''}.`, 300);
}

/** The clue's one paragraph: how many examples, their labels, regions and notes. */
export function clueText(category, items) {
  const n = items.length;
  const parts = [`GeoHints shows ${n} ${n === 1 ? lowerFirst(category.noun) : lowerFirst(category.plural)} from here.`];
  const labels = items.flatMap((i) => [...i.tags, ...i.labels]);
  const regions = items.flatMap((i) => i.regions);
  const notes = [...new Set(items.flatMap((i) => i.notes))];
  if (labels.length) parts.push(`Labels: ${countList(labels, 30)}.`);
  if (regions.length) parts.push(`Regions: ${countList(regions, 30)}.`);
  if (notes.length) parts.push(`Notes: ${notes.map((s) => s.replace(/[.!?]?$/, '.')).join(' ')}`);
  return parts.join(' ');
}

/**
 * GeoHints items → { clues: Map(code → Clue-like objects without step/order), unmatched: { name: count } }.
 * One clue per country and category, images in GeoHints order without repeats of a src. An image whose
 * src is listed under several countries (one sign design for many) marks them in each one's `sameAs`.
 * `regionNamesOf(code)` → the country's region names (content/maps); `locate(link)` → the Street View
 * spot of an image link ({ pano?, lat, lng, heading, pitch, fov }) or undefined.
 */
export function buildGeoHints({ items, lines = [] }, { lookup, poolCodes, locate = () => undefined, regionNamesOf = () => [] }) {
  const unmatched = {};
  const groups = new Map(); // "<code> <slug>" → { code, category, items: [] }
  const regionTest = new Map();
  const isRegionOf = (code) => {
    if (!regionTest.has(code)) {
      const names = new Set(regionNamesOf(code).map(fold));
      regionTest.set(code, (label) => names.has(fold(label)));
    }
    return regionTest.get(code);
  };
  const countriesOfSrc = new Map();
  for (const item of items) {
    const target = geohintsCountry(item.country, lookup, poolCodes);
    if (!target) {
      unmatched[item.country] = (unmatched[item.country] ?? 0) + 1;
      continue;
    }
    const key = `${target.code} ${item.category.slug}`;
    if (!groups.has(key)) groups.set(key, { code: target.code, category: item.category, items: [], srcs: new Set() });
    const group = groups.get(key);
    if (group.srcs.has(item.img)) continue;
    group.srcs.add(item.img);
    const read = readLabels(item.category, item.t, isRegionOf(target.code));
    if (target.region) read.regions.unshift(target.region);
    group.items.push({ ...read, src: item.img, maps: item.maps });
    if (!countriesOfSrc.has(item.img)) countriesOfSrc.set(item.img, new Set());
    countriesOfSrc.get(item.img).add(target.code);
  }

  const clues = new Map();
  for (const { code, category, items: list } of groups.values()) {
    const images = list.map((i) => {
      const spot = locate(i.maps);
      // ClueLocation has no 'geohints' source: GeoHints spots count as saved Street View spots
      const location = spot && { ...spot, source: 'saved' };
      return { id: mediaId(i.src), src: i.src, role: 'example', caption: itemCaption(category, i, i.src), ...(location && { location }) };
    });
    const regionKeys = new Set(list.map((i) => i.regions.join(', ')));
    const region = regionKeys.size === 1 && [...regionKeys][0] ? [...regionKeys][0] : undefined;
    const sameAs = [...new Set(list.flatMap((i) => [...countriesOfSrc.get(i.src)]))].filter((c) => c !== code).sort();
    const spots = new Map();
    for (const { location: l } of images) if (l && !spots.has(l.pano ?? `${l.lat},${l.lng},${l.heading}`)) spots.set(l.pano ?? `${l.lat},${l.lng},${l.heading}`, l);
    const locations = [...spots.values()];
    if (!clues.has(code)) clues.set(code, []);
    clues.get(code).push({
      id: `${code.toLowerCase()}-gh-${category.slug}`,
      family: category.family,
      ...(category.family === 'sign' && { kind: category.kind }),
      title: category.title,
      text: [clueText(category, list)],
      ...(region && { region }),
      tags: [],
      images,
      locations,
      lookalikes: [],
      summary: clueSummary(category, list),
      ...(sameAs.length && { sameAs }),
      credit: { source: 'GeoHints', url: `${GEOHINTS}/meta/${category.path}`, licence: LICENCE },
    });
  }
  for (const group of lines) {
    const { outer, inner, slug } = lineType(group.type);
    const codes = [];
    for (const name of group.countries) {
      const target = geohintsCountry(name, lookup, poolCodes);
      if (!target) unmatched[name] = (unmatched[name] ?? 0) + 1;
      else if (!codes.includes(target.code)) codes.push(target.code);
    }
    for (const code of codes) {
      if (!clues.has(code)) clues.set(code, []);
      const sameAs = codes.filter((c) => c !== code).sort();
      clues.get(code).push({
        id: `${code.toLowerCase()}-gh-lines-${slug}`,
        family: 'line',
        title: `Road lines: ${outer} edges, ${inner} centre`,
        text: [`The road markings here are ${outer} at the edges and ${inner} in the centre.`],
        tags: [],
        images: [],
        locations: [],
        lookalikes: [],
        summary: `Road lines are ${outer} at the edges and ${inner} in the centre.`,
        ...(sameAs.length && { sameAs }),
        credit: { source: 'GeoHints', url: `${GEOHINTS}/meta/lines`, licence: LICENCE },
      });
    }
  }
  const rank = (clue) => (clue.family === 'line' ? CATEGORIES.length : CATEGORIES.findIndex((c) => clue.credit.url.endsWith(`/meta/${c.path}`)));
  for (const list of clues.values()) list.sort((a, b) => rank(a) - rank(b));
  return { clues, unmatched };
}
