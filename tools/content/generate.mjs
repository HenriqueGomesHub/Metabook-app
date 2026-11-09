// content/cards/generated-<code>.json from content/facts and content/media, via the pure
// generator in packages/core. Generated files belong to this script and are rewritten each run.
// CLI: node tools/content/generate.mjs [--countries pl,lt | all]
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { generateCards } from '../../packages/core/src/generate.ts';
import { CONTENT, isMain, jsonFilesIn, loadPool, parseArgs, readJson, resolveCountries, writeJson } from './lib/common.mjs';

export function loadInput() {
  const read = (dir) => jsonFilesIn(join(CONTENT, dir)).map((f) => readJson(join(CONTENT, dir, f)));
  return { pool: loadPool(), facts: read('facts'), media: read('media').flat() };
}

/** Writes (or removes, when empty) one country's generated file; returns its card count. */
export function writeGenerated(code, input = loadInput()) {
  const cards = generateCards(code, input);
  const path = join(CONTENT, 'cards', `generated-${code.toLowerCase()}.json`);
  if (cards.length > 0) writeJson(path, cards);
  else if (existsSync(path)) rmSync(path);
  const byType = {};
  for (const card of cards) byType[card.type] = (byType[card.type] ?? 0) + 1;
  return { cards: cards.length, byType };
}

if (isMain(import.meta)) {
  const input = loadInput();
  for (const code of resolveCountries(parseArgs().countries ?? 'all')) {
    console.log(code, JSON.stringify(writeGenerated(code, input)));
  }
}
