// Marks approved rows collected once their photos are in content/media on main. The collect
// workflow runs it only after the push succeeds, so a failed run leaves the rows unmarked and the
// next run collects them again (collect.mjs skips what is already in content/media). Approved
// media_uses are marked the same way, by their own MediaItem ids.
// CLI: node tools/content/mark-collected.mjs
import { join } from 'node:path';
import { toMediaItem, useMediaId } from './collect.mjs';
import { CONTENT, isMain, jsonFilesIn, readJson } from './lib/common.mjs';

/** Ids of every MediaItem in content/media. */
export function mediaIds(contentDir = CONTENT) {
  const dir = join(contentDir, 'media');
  return new Set(jsonFilesIn(dir).flatMap((f) => readJson(join(dir, f), []).map((m) => m.id)));
}

/**
 * Marks the approved, uncollected rows and uses whose media id is in content/media;
 * returns { marked, waiting, uses: { marked, waiting } }.
 */
export async function markCollected({ queue, contentDir = CONTENT }) {
  const ids = mediaIds(contentDir);
  const rows = await queue.listApproved({ uncollected: true });
  const done = rows.filter((row) => ids.has(toMediaItem(row).id));
  await queue.markCollected(done.map((row) => row.id));
  const uses = await queue.listApprovedUses();
  const usesDone = uses.filter((use) => ids.has(useMediaId(use)));
  await queue.markUsesCollected(usesDone.map((use) => use.id));
  return {
    marked: done.length,
    waiting: rows.length - done.length,
    uses: { marked: usesDone.length, waiting: uses.length - usesDone.length },
  };
}

if (isMain(import.meta)) {
  const { createQueue } = await import('./queue.mjs');
  console.log(JSON.stringify(await markCollected({ queue: createQueue() })));
}
