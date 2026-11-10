// Checks an agent's review file against the review pack before it is committed: the same rules
// the review step applies (review.mjs), plus every id must be in the manifest. Prints the problems
// and exits 1 when there are any.
// CLI: node tools/content/review-check.mjs content/review/batch-01.json [--manifest review-pack/manifest.json]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain, parseArgs, ROOT } from './lib/common.mjs';
import { entryProblem } from './review.mjs';

/** → { problems: string[], counts: { entries, rejects, uses } } */
export function checkReview(list, manifest) {
  const problems = [];
  const counts = { entries: 0, rejects: 0, uses: 0 };
  if (!Array.isArray(list)) return { problems: ['the file must be a JSON array'], counts };
  const known = new Set(manifest.map((m) => m.id));
  const seen = new Set();
  list.forEach((entry, i) => {
    counts.entries++;
    const where = `entry ${i + 1} (${entry?.id ?? '?'})`;
    const problem = entryProblem(entry);
    if (problem) return problems.push(`${where}: ${problem}`);
    if (!known.has(entry.id)) problems.push(`${where}: id not in the manifest`);
    if (seen.has(entry.id)) problems.push(`${where}: duplicate id`);
    seen.add(entry.id);
    if (entry.reject != null) counts.rejects++;
    else counts.uses += entry.uses.length;
  });
  return { problems, counts };
}

if (isMain(import.meta)) {
  const args = parseArgs(process.argv.slice(3));
  const file = process.argv[2];
  if (!file || file.startsWith('--')) {
    console.error('usage: node tools/content/review-check.mjs <file> [--manifest review-pack/manifest.json]');
    process.exit(2);
  }
  const manifestPath = typeof args.manifest === 'string' ? args.manifest : join(ROOT, 'review-pack', 'manifest.json');
  const { problems, counts } = checkReview(
    JSON.parse(readFileSync(file, 'utf8')),
    JSON.parse(readFileSync(manifestPath, 'utf8')),
  );
  for (const p of problems) console.log(`✗ ${p}`);
  console.log(`${counts.entries} entries: ${counts.rejects} rejected, ${counts.uses} uses; ${problems.length} problems`);
  process.exit(problems.length ? 1 : 0);
}
