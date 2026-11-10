// Applies the vision agents' review (content/review/*.json, see REVIEW_GUIDE.md) to the queue.
// Each file is an array of { id, reject?: string, uses?: [{ subject, crop: {x,y,w,h}, note? }] }.
// A reject sets a still-pending candidate to 'rejected'; uses are inserted into media_uses as
// 'suggested' and the candidate becomes 'reviewed'. Only pending candidates are touched, and uses
// already there are left alone, so running it again changes nothing. Invalid entries (bad subject,
// crop out of bounds, unknown id, ...) are reported and skipped, never fatal.
// CLI: node tools/content/review.mjs
import { join } from 'node:path';
import { CONTENT, isMain, jsonFilesIn, readJson } from './lib/common.mjs';

export const REVIEW_DIR = join(CONTENT, 'review');
export const SUBJECTS = ['bollard', 'pole', 'plate', 'sign', 'line', 'guardrail', 'language', 'car', 'landscape', 'architecture', 'other'];
export const MAX_USES = 4;
export const MIN_SIDE = 0.1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDGE = 1.0001;

const round = (v) => Math.round(v * 10000) / 10000;

/** Why a crop is invalid, or null. */
export function cropProblem(crop) {
  if (!crop || typeof crop !== 'object') return 'crop missing';
  const { x, y, w, h } = crop;
  if (![x, y, w, h].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) return 'crop values must be numbers 0..1';
  if (w < MIN_SIDE || h < MIN_SIDE) return `crop w and h must be at least ${MIN_SIDE}`;
  if (x + w > EDGE || y + h > EDGE) return 'crop runs past the image (x+w or y+h > 1)';
  return null;
}

/** Why an entry is invalid, or null. */
export function entryProblem(entry) {
  if (!entry || typeof entry !== 'object') return 'not an object';
  if (typeof entry.id !== 'string' || !UUID.test(entry.id)) return 'id must be a candidate uuid';
  const hasReject = entry.reject != null;
  const hasUses = entry.uses != null;
  if (hasReject === hasUses) return 'needs exactly one of reject or uses';
  if (hasReject) return typeof entry.reject === 'string' && entry.reject.trim() ? null : 'reject must be a non-empty reason';
  if (!Array.isArray(entry.uses) || entry.uses.length === 0) return 'uses must be a non-empty array';
  if (entry.uses.length > MAX_USES) return `at most ${MAX_USES} uses`;
  for (const [i, use] of entry.uses.entries()) {
    if (!SUBJECTS.includes(use?.subject)) return `use ${i + 1}: bad subject ${JSON.stringify(use?.subject)}`;
    const crop = cropProblem(use.crop);
    if (crop) return `use ${i + 1}: ${crop}`;
    if (use.note != null && typeof use.note !== 'string') return `use ${i + 1}: note must be a string`;
  }
  return null;
}

/** Every entry of every review file, with its file name: → [{ file, entry }]. */
export function readReviews(dir = REVIEW_DIR) {
  return jsonFilesIn(dir).flatMap((file) => {
    const list = readJson(join(dir, file), []);
    return Array.isArray(list) ? list.map((entry) => ({ file, entry })) : [{ file, entry: undefined }];
  });
}

/** A valid use → its media_uses row (crop rounded so the unique key is stable). */
export const toUseRow = (candidateId, { subject, crop, note }) => ({
  candidate_id: candidateId,
  subject,
  crop: { x: round(crop.x), y: round(crop.y), w: round(crop.w), h: round(crop.h) },
  note: note?.trim() || null,
});

/**
 * → { all: { counts: { entries, rejected, reviewed, uses, skipped, invalid }, errors, invalid } }.
 * `skipped`: the candidate is no longer pending (already applied, or decided in /curate).
 */
export async function applyReviews({ queue, dir = REVIEW_DIR }) {
  const counts = { entries: 0, rejected: 0, reviewed: 0, uses: 0, skipped: 0, invalid: 0 };
  const invalid = [];
  const seen = new Set();
  const valid = [];
  for (const { file, entry } of readReviews(dir)) {
    counts.entries++;
    const problem = entryProblem(entry) ?? (seen.has(entry.id) ? 'duplicate id' : null);
    if (problem) {
      counts.invalid++;
      invalid.push(`${file} ${entry?.id ?? '?'}: ${problem}`);
      continue;
    }
    seen.add(entry.id);
    valid.push({ file, entry });
  }

  const statuses = await queue.statuses(valid.map(({ entry }) => entry.id));
  const pending = [];
  for (const { file, entry } of valid) {
    const status = statuses.get(entry.id);
    if (status === 'pending') pending.push(entry);
    else if (status) counts.skipped++;
    else {
      counts.invalid++;
      invalid.push(`${file} ${entry.id}: no such candidate`);
    }
  }

  const rejects = pending.filter((e) => e.reject != null);
  const reviews = pending.filter((e) => e.uses);
  counts.rejected = (await queue.settlePending(rejects.map((e) => e.id), 'rejected')).length;
  // uses first: a run that stops in between leaves the candidate pending, and the next run
  // inserts nothing new and finishes the status
  const rows = reviews.flatMap((e) => e.uses.map((use) => toUseRow(e.id, use)));
  await queue.insertUses(rows);
  counts.uses = rows.length;
  counts.reviewed = (await queue.settlePending(reviews.map((e) => e.id), 'reviewed')).length;
  return { all: { counts, errors: [], invalid } };
}

if (isMain(import.meta)) {
  const { createQueue } = await import('./queue.mjs');
  console.log(JSON.stringify(await applyReviews({ queue: createQueue() }), null, 2));
}
