// Shared by commons and mapillary: download, resize, upload to candidates/ and queue each new photo.
import { download, processImage } from '../images.mjs';

/**
 * `candidates` carry { id, country, subject, source, sourceUrl, downloadUrl, credit, licence, … }.
 * Ones already queued (by source_url) are skipped; at most `cap` new ones are processed.
 * Returns counts plus per-photo error messages; one bad photo never stops the rest.
 */
export async function ingest(candidates, { storage, queue, cap }) {
  const country = candidates[0]?.country;
  const known = country ? await queue.knownSourceUrls(country) : new Set();
  const fresh = candidates.filter((c) => !known.has(c.sourceUrl)).slice(0, cap);
  const ready = [];
  const errors = [];
  for (const candidate of fresh) {
    try {
      const image = await processImage(await download(candidate.downloadUrl));
      const storagePath = `candidates/${candidate.id}.webp`;
      await storage.upload(storagePath, image.webp);
      ready.push({ ...candidate, storagePath, width: image.width, height: image.height, preview: image.preview });
    } catch (error) {
      errors.push(`${candidate.sourceUrl}: ${error.message}`);
    }
  }
  await queue.insert(ready);
  return {
    counts: { found: candidates.length, alreadyQueued: candidates.length - candidates.filter((c) => !known.has(c.sourceUrl)).length, queued: ready.length, failed: errors.length },
    errors,
  };
}
