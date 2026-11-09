// Base facts from Wikidata: driving side, TLD, calling code, official languages and their scripts.
// One SPARQL query for all requested countries; results only fill fields a facts file lacks.
// CLI: node tools/content/wikidata.mjs [--countries pl,lt | --countries all]
import { join } from 'node:path';
import {
  CONTENT,
  getJson,
  isMain,
  loadPool,
  parseArgs,
  readJson,
  resolveCountries,
  writeJson,
} from './lib/common.mjs';

const ENDPOINT = 'https://query.wikidata.org/sparql';

/** sovereign state, dependent territory, political territory: what an ISO 3166-1 code can name */
const KINDS = ['Q3624078', 'Q161243', 'Q1048835'];

export function buildQuery(codes) {
  const values = codes.map((c) => `"${c.toUpperCase()}"`).join(' ');
  return `SELECT ?code ?item ?sideLabel ?tldLabel ?calling ?langLabel ?scriptLabel WHERE {
  VALUES ?code { ${values} }
  ?item wdt:P297 ?code .
  ?item wdt:P31 ?kind .
  VALUES ?kind { ${KINDS.map((k) => `wd:${k}`).join(' ')} }
  FILTER NOT EXISTS { ?item wdt:P576 ?dissolved . }
  OPTIONAL { ?item wdt:P1622 ?side . }
  OPTIONAL { ?item wdt:P78 ?tld . }
  OPTIONAL { ?item wdt:P474 ?calling . }
  OPTIONAL { ?item wdt:P37 ?lang . OPTIONAL { ?lang wdt:P282 ?script . } }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

const add = (list, value) => {
  if (value && !list.includes(value)) list.push(value);
};

/**
 * Keeps the rows of one item per ISO code. Several items can share a code (a country and, say, a
 * historical state); the one with a driving side (P1622) or a TLD (P78) wins, then the lowest Q number.
 */
function onePerCode(rows) {
  const items = {};
  for (const row of rows) {
    const code = row.code?.value?.toLowerCase();
    const id = row.item?.value?.split('/').pop();
    if (!code || !id) continue;
    const item = ((items[code] ??= {})[id] ??= { id, useful: false });
    item.useful ||= Boolean(row.sideLabel || row.tldLabel);
  }
  const chosen = {};
  for (const [code, candidates] of Object.entries(items)) {
    const [best] = Object.values(candidates).sort(
      (a, b) => Number(b.useful) - Number(a.useful) || Number(a.id.slice(1)) - Number(b.id.slice(1)),
    );
    chosen[code] = best.id;
  }
  return rows.filter((row) => chosen[row.code?.value?.toLowerCase()] === row.item?.value?.split('/').pop());
}

/**
 * SPARQL JSON results → { pl: { wikidata, drivingSide?, tld, callingCode, languages, scripts } }.
 * The driving side is left out when Wikidata lists both sides.
 */
export function parseResults(json) {
  const byCode = {};
  const sides = {};
  for (const row of onePerCode(json.results?.bindings ?? [])) {
    const code = row.code?.value?.toLowerCase();
    if (!code) continue;
    const entry = (byCode[code] ??= {
      wikidata: row.item?.value?.split('/').pop(),
      tld: [],
      callingCode: [],
      languages: [],
      scripts: [],
    });
    const side = row.sideLabel?.value ?? '';
    add((sides[code] ??= []), side.includes('left') ? 'left' : side.includes('right') ? 'right' : '');
    add(entry.tld, row.tldLabel?.value?.startsWith('.') ? row.tldLabel.value : undefined);
    add(entry.callingCode, row.calling?.value);
    add(entry.languages, row.langLabel?.value);
    add(entry.scripts, row.scriptLabel?.value);
  }
  for (const [code, list] of Object.entries(sides)) {
    if (list.length === 1) byCode[code].drivingSide = list[0];
  }
  return byCode;
}

const BASE_FIELDS = ['wikidata', 'drivingSide', 'tld', 'callingCode', 'languages', 'scripts'];

/**
 * Fills only the base fields `existing` lacks; notes, extra keys and every value already there
 * are kept as they are. Returns the merged file and the fields that were added.
 */
export function mergeFacts(existing, fetched, poolEntry) {
  const base = existing ?? { code: poolEntry.code.toLowerCase(), name: poolEntry.name, notes: [] };
  const added = [];
  const filled = {};
  for (const field of BASE_FIELDS) {
    const value = fetched?.[field];
    const empty = value === undefined || (Array.isArray(value) && value.length === 0);
    if (base[field] !== undefined) filled[field] = base[field];
    else if (!empty) {
      filled[field] = value;
      added.push(field);
    }
  }
  const { code, name, notes, ...rest } = base;
  for (const field of BASE_FIELDS) delete rest[field];
  return { facts: { code, name, ...filled, ...rest, notes: notes ?? [] }, added };
}

export async function fetchFacts(codes) {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(buildQuery(codes))}`;
  return parseResults(await getJson(url, { headers: { Accept: 'application/sparql-results+json' } }));
}

/** Runs the query and merges into content/facts; returns per-country { added, missing }. */
export async function updateFacts(codes, pool = loadPool()) {
  const fetched = await fetchFacts(codes);
  const report = {};
  for (const code of codes) {
    const path = join(CONTENT, 'facts', `${code}.json`);
    const entry = pool.find((c) => c.code === code.toUpperCase());
    const existing = readJson(path);
    const { facts, added } = mergeFacts(existing, fetched[code], entry);
    // untouched files are not rewritten, so hand formatting survives
    if (!existing || added.length > 0) writeJson(path, facts);
    report[code] = { added, missing: !fetched[code] };
  }
  return report;
}

if (isMain(import.meta)) {
  const args = parseArgs();
  const codes = resolveCountries(args.countries ?? 'all');
  console.log(JSON.stringify(await updateFacts(codes), null, 2));
}
