// content/cards/generated-<code>.json from content/facts and content/media, via the pure
// generator in packages/core (plus content/maps for `where` cards). Generated files belong to this script and are rewritten each run.
// CLI: node tools/content/generate.mjs [--countries pl,lt | all]
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { generateCards } from '../../packages/core/src/generate.ts';
import { CONTENT, isMain, jsonFilesIn, loadPool, parseArgs, readJson, resolveCountries, writeJson } from './lib/common.mjs';

/** Regions maps by upper-case code: every <code>-regions.json, plus Brazil's br-states.json. */
export function loadMaps() {
  const dir = join(CONTENT, 'maps');
  const files = jsonFilesIn(dir).filter((f) => f.endsWith('-regions.json') || f === 'br-states.json');
  return Object.fromEntries(
    files.map((f) => [f.split('-')[0].toUpperCase(), readJson(join(dir, f))]),
  );
}

export function loadInput() {
  const read = (dir) => jsonFilesIn(join(CONTENT, dir)).map((f) => readJson(join(CONTENT, dir, f)));
  return { pool: loadPool(), facts: read('facts'), media: read('media').flat(), maps: loadMaps() };
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
