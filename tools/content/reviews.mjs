// Reviews applied by the `clues` step on every build, so they survive a re-fetch.
//
// content/review-images/*.json: arrays of { imageId, role: 'example'|'comparison'|'annotated',
//   caption?, giveaway?, crop?: {x, y, w, h} (fractions), reject?, country?: 'XX' }. Applies to every
//   clue holding the image: sets role, caption, giveaway and crop; `reject` drops the image; a
//   `country` other than the clue's (the picture shows another country) drops it from that clue.
//   Files are read in name order; a later entry for the same image wins.
// content/review-text/<code>.json: { <clue id>: { title?, summary?, sameAs?, differs?, hide? } } sets
//   the clue's title, summary, sameAs and differs; `hide` drops the clue.
import { join } from 'node:path';
import { CONTENT, jsonFilesIn, readJson } from './lib/common.mjs';

export const REVIEW_IMAGES_DIR = join(CONTENT, 'review-images');
export const REVIEW_TEXT_DIR = join(CONTENT, 'review-text');
const ROLES = ['example', 'comparison', 'annotated'];
export const CAPTION_MAX = 200;
export const SUMMARY_MAX = 300;
const LIST_MAX = 50;

const fraction = (v) => typeof v === 'number' && v >= 0 && v <= 1;
const validCrop = (c) => c && [c.x, c.y, c.w, c.h].every(fraction) && c.w > 0 && c.h > 0 && c.x + c.w <= 1.001 && c.y + c.h <= 1.001;
const isText = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;

/** Why an image review entry is unusable, or undefined. */
export function imageEntryProblem(e, codes) {
  if (!e || typeof e.imageId !== 'string' || !e.imageId) return 'no imageId';
  if (!e.reject && !ROLES.includes(e.role)) return `role must be one of ${ROLES.join(', ')}`;
  if (e.role != null && !ROLES.includes(e.role)) return `bad role ${e.role}`;
  if (e.caption != null && !isText(e.caption, CAPTION_MAX)) return `caption must be 1..${CAPTION_MAX} characters`;
  if (e.giveaway != null && typeof e.giveaway !== 'boolean') return 'giveaway must be boolean';
  if (e.reject != null && typeof e.reject !== 'boolean') return 'reject must be boolean';
  if (e.crop != null && !validCrop(e.crop)) return 'crop must be fractions {x, y, w, h} inside the image';
  if (e.country != null && !codes.has(String(e.country).toUpperCase())) return `country ${e.country} is not a pool code`;
  return undefined;
}

/** Reads content/review-images → { entries: Map(imageId → entry), files, invalid: [] }. */
export function loadImageReviews(dir, codes) {
  const entries = new Map();
  const invalid = [];
  const files = jsonFilesIn(dir);
  for (const file of files) {
    const list = readJson(join(dir, file));
    if (!Array.isArray(list)) {
      invalid.push(`${file}: not an array`);
      continue;
    }
    list.forEach((e, i) => {
      const problem = imageEntryProblem(e, codes);
      if (problem) invalid.push(`${file}[${i}]: ${problem}`);
      else entries.set(e.imageId, e);
    });
  }
  return { entries, files: files.length, invalid };
}

/** Applies image reviews to built countries (in place). → the `images` part of the reviews report. */
export function applyImageReviews(countries, { entries, files, invalid }) {
  const report = { files, entries: entries.size, applied: 0, rejected: 0, countryMismatch: [], unknownIds: [], invalid };
  const seen = new Set();
  for (const country of countries) {
    for (const clue of country.clues) {
      const before = clue.images.length;
      clue.images = clue.images.filter((image) => {
        const e = entries.get(image.id);
        if (!e) return true;
        seen.add(image.id);
        if (e.reject) {
          report.rejected++;
          return false;
        }
        if (e.country && e.country.toUpperCase() !== country.country) {
          report.countryMismatch.push({ imageId: image.id, clueId: clue.id, clueCountry: country.country, shows: e.country.toUpperCase() });
          return false;
        }
        if (e.role) image.role = e.role;
        if (e.caption) image.caption = e.caption.trim();
        if (e.giveaway === true) image.giveaway = true;
        if (e.giveaway === false) delete image.giveaway;
        if (e.crop) image.crop = { x: e.crop.x, y: e.crop.y, w: e.crop.w, h: e.crop.h };
        report.applied++;
        return true;
      });
      // a dropped image's Street View spot goes with it
      if (clue.images.length < before) clue.locations = clue.locations.filter((l) => clue.images.some((i) => i.location && JSON.stringify(i.location) === JSON.stringify(l)));
    }
  }
  report.unknownIds = [...entries.keys()].filter((id) => !seen.has(id)).sort();
  return report;
}

const codeList = (v, own, codes) => Array.isArray(v) && v.every((c) => typeof c === 'string' && codes.has(c.toUpperCase()) && c.toUpperCase() !== own);

/** Why a text review entry is unusable, or undefined. */
export function textEntryProblem(e, own, codes) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return 'not an object';
  if (e.title != null && !isText(e.title, 120)) return 'title must be 1..120 characters';
  if (e.summary != null && !isText(e.summary, SUMMARY_MAX)) return `summary must be 1..${SUMMARY_MAX} characters`;
  if (e.sameAs != null && !codeList(e.sameAs, own, codes)) return 'sameAs must be other pool codes';
  if (e.differs != null && !(Array.isArray(e.differs) && e.differs.every((d) => d && codeList([d.country], own, codes) && isText(d.how, 200)))) {
    return 'differs must be [{ country: other pool code, how }]';
  }
  // true, or the reason as text ("duplicate of pl-vySo")
  if (e.hide != null && typeof e.hide !== 'boolean' && !isText(e.hide, 200)) return 'hide must be true or a reason';
  return undefined;
}

/** Reads content/review-text → { byCountry: Map(code → { clueId: entry }), files, invalid: [] }. */
export function loadTextReviews(dir, codes) {
  const byCountry = new Map();
  const invalid = [];
  const files = jsonFilesIn(dir);
  for (const file of files) {
    const code = file.replace(/\.json$/, '').toUpperCase();
    if (!codes.has(code)) {
      invalid.push(`${file}: ${code} is not a pool code`);
      continue;
    }
    const raw = readJson(join(dir, file));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      invalid.push(`${file}: not an object`);
      continue;
    }
    const entries = {};
    for (const [clueId, e] of Object.entries(raw)) {
      const problem = textEntryProblem(e, code, codes);
      if (problem) invalid.push(`${file} ${clueId}: ${problem}`);
      else entries[clueId] = e;
    }
    byCountry.set(code, entries);
  }
  return { byCountry, files: files.length, invalid };
}

/** Applies text reviews to built countries (in place). → the `text` part of the reviews report. */
export function applyTextReviews(countries, { byCountry, files, invalid }) {
  const report = { files, applied: 0, hidden: 0, hiddenIds: [], unknownIds: [], invalid };
  for (const [code, entries] of byCountry) {
    const country = countries.find((c) => c.country === code);
    const ids = new Set(country?.clues.map((c) => c.id) ?? []);
    report.unknownIds.push(...Object.keys(entries).filter((id) => !ids.has(id)).map((id) => `${code.toLowerCase()}:${id}`));
    if (!country) continue;
    country.clues = country.clues.filter((clue) => {
      const e = entries[clue.id];
      if (!e) return true;
      if (e.hide) {
        report.hidden++;
        report.hiddenIds.push(clue.id);
        return false;
      }
      if (e.title) clue.title = e.title.trim();
      if (e.summary) clue.summary = e.summary.trim();
      if (e.sameAs) clue.sameAs = [...new Set(e.sameAs.map((c) => c.toUpperCase()))].sort();
      if (e.differs) clue.differs = e.differs.map((d) => ({ country: d.country.toUpperCase(), how: d.how.trim() }));
      report.applied++;
      return true;
    });
  }
  return report;
}

/** Short lists for the job result: long ones are cut to LIST_MAX with their full count. */
export function trimReport(report) {
  const out = {};
  for (const [k, v] of Object.entries(report)) {
    out[k] = Array.isArray(v) && v.length > LIST_MAX ? [...v.slice(0, LIST_MAX), `… ${v.length - LIST_MAX} more`] : v;
  }
  return out;
}
