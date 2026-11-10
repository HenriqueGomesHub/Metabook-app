// Recomputes each country's area-code groups (codes by leading significant digit) and checks
// content/areacodes/patterns.json against them: every country with codes has an entry, a pattern
// country's group keys are exactly the computed ones, and each group label names (by map region
// names or the entry's `areas`) every region of the group and nothing outside it.
//
//   node tools/content/areacode-patterns.mjs            check, exit 1 on errors
//   node tools/content/areacode-patterns.mjs --report   also print the groups and their strength
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patternGroups, patternKey, regionKeys } from '../../packages/core/src/areaCodePatterns.ts';

const content = join(dirname(fileURLToPath(import.meta.url)), '../../content');
const load = (path) => JSON.parse(readFileSync(join(content, path), 'utf8'));

/** Every country's placed codes: the content/areacodes files plus Brazil's hand-written cards. */
export function loadCodes() {
  const byCountry = new Map();
  for (const f of readdirSync(join(content, 'areacodes'))) {
    if (!/^[a-z]{2}\.json$/.test(f)) continue;
    const file = load(`areacodes/${f}`);
    byCountry.set(String(file.country).toUpperCase(), file.codes ?? []);
  }
  // hand-written cards (Brazil's) for countries without a file
  const fromCards = new Map();
  for (const f of readdirSync(join(content, 'cards'))) {
    if (!f.endsWith('.json') || f.startsWith('generated-')) continue;
    for (const card of load(`cards/${f}`)) {
      if (card.type !== 'areacode' || byCountry.has(card.country)) continue;
      const list = fromCards.get(card.country) ?? [];
      list.push({ code: card.prompt.value, region: card.answer, ...(card.spans && { spans: card.spans }) });
      fromCards.set(card.country, list);
    }
  }
  return new Map([...byCountry, ...fromCards]);
}

function loadMap(country) {
  const path = country === 'BR' ? 'maps/br-states.json' : `maps/${country.toLowerCase()}-regions.json`;
  return existsSync(join(content, path)) ? load(path) : undefined;
}

const fold = (s) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[’‘]/g, "'").toLowerCase();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Short forms of a map name: "Silesian Voivodeship" → "Silesian", "Republic of Tatarstan" → "Tatarstan". */
const shortNames = (name) => [
  name,
  name.replace(/\s+(Voivodeship|Province|Region|Department|Departament|Oblast|Krai|Okrug)$/i, ''),
  name.replace(/^(Republic of|Autonomous Republic of)\s+/i, ''),
];

/** The regions a label names, by the map's region names and the entry's areas, longest first. */
export function namedRegions(label, map, areas = {}) {
  const needles = new Map();
  const add = (name, codes) => {
    const key = fold(name.trim());
    if (key.length < 2) return;
    needles.set(key, [...new Set([...(needles.get(key) ?? []), ...codes])]);
  };
  for (const region of map.states) for (const name of shortNames(region.name)) add(name, [region.code]);
  for (const [name, codes] of Object.entries(areas)) add(name, codes);
  let rest = fold(label);
  const found = new Map();
  for (const [needle, codes] of [...needles].sort(([a], [b]) => b.length - a.length)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(needle)}(?![\\p{L}\\p{N}])`, 'gu');
    if (!re.test(rest)) continue;
    found.set(needle, codes);
    rest = rest.replace(re, ' ');
  }
  return found;
}

/** How clustered the groups are: share of regions in one group only, and mean spread vs the country's. */
function strength(country, codes, digits, map) {
  const keys = regionKeys(country, codes, digits);
  const purity = [...keys.values()].filter((k) => k.length === 1).length / Math.max(keys.size, 1);
  const label = new Map();
  for (const s of map?.states ?? []) if (!label.has(s.code)) label.set(s.code, s.label);
  const centre = (pts) => [0, 1].map((i) => pts.reduce((sum, p) => sum + p[i], 0) / pts.length);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // spread over every region a group reaches, spans included (France's five codes span 96)
  const reach = new Map();
  for (const c of codes) {
    const key = patternKey(country, c.code, digits);
    reach.set(key, new Set([...(reach.get(key) ?? []), c.region, ...(c.spans ?? [])]));
  }
  const all = [...new Set([...reach.values()].flatMap((s) => [...s]))]
    .map((r) => label.get(r))
    .filter(Boolean);
  if (all.length < 2) return { purity, spread: 0 };
  const whole = centre(all);
  const base = all.reduce((sum, p) => sum + dist(p, whole), 0) / all.length;
  let inner = 0;
  let n = 0;
  for (const group of reach.values()) {
    const pts = [...group].map((r) => label.get(r)).filter(Boolean);
    const c = centre(pts);
    for (const p of pts) inner += dist(p, c);
    n += pts.length;
  }
  return { purity, spread: base > 0 ? inner / n / base : 0 };
}

/** Errors in patterns.json against the codes; `report` also prints the computed groups. */
export function checkAreaCodePatterns({ report = false } = {}) {
  const errors = [];
  const path = join(content, 'areacodes/patterns.json');
  if (!existsSync(path)) return ['areacodes/patterns.json: missing'];
  const patterns = load('areacodes/patterns.json');
  const codes = loadCodes();
  for (const cc of codes.keys()) if (!patterns[cc]) errors.push(`patterns.json: no entry for ${cc}`);
  for (const [cc, entry] of Object.entries(patterns)) {
    const w = `patterns.json ${cc}`;
    const list = codes.get(cc);
    if (!list) {
      errors.push(`${w}: no area codes for this country`);
      continue;
    }
    if (!['pattern', 'memorise'].includes(entry.kind)) errors.push(`${w}: kind must be pattern or memorise`);
    if (![1, 2, 3].includes(entry.digits)) errors.push(`${w}: digits must be 1, 2 or 3`);
    if (typeof entry.summary !== 'string' || !entry.summary.trim()) errors.push(`${w}: summary missing`);
    if (typeof entry.hook !== 'string' || !entry.hook.trim() || entry.hook.length > 64) errors.push(`${w}: hook must be one short line (≤ 64 characters)`);
    if (entry.tip != null && (typeof entry.tip !== 'string' || !entry.tip.trim())) errors.push(`${w}: tip must be text`);
    if (!Array.isArray(entry.groups)) {
      errors.push(`${w}: groups must be a list`);
      continue;
    }
    const map = loadMap(cc);
    if (!map) {
      errors.push(`${w}: no regions map`);
      continue;
    }
    const regions = new Set(map.states.map((s) => s.code));
    for (const [name, area] of Object.entries(entry.areas ?? {})) {
      for (const r of area) if (!regions.has(r)) errors.push(`${w}: area "${name}" names ${r}, not a region of the map`);
    }
    const computed = patternGroups(cc, list, entry.digits);
    if (report) {
      const s = strength(cc, list, entry.digits, map);
      const name = new Map();
      for (const st of map.states) if (!name.has(st.code)) name.set(st.code, st.name);
      console.log(
        `\n${cc} ${entry.kind} digits=${entry.digits} codes=${list.length} groups=${computed.length} one-group regions=${s.purity.toFixed(2)} spread=${s.spread.toFixed(2)}`,
      );
      for (const g of computed)
        console.log(`  ${g.form.padEnd(10)} ${String(Math.round(g.share * 100)).padStart(3)}%  ${g.regions.map((r) => name.get(r) ?? r).join(', ')}`);
    }
    if (entry.kind === 'memorise') {
      if (entry.groups.length > 0) errors.push(`${w}: a memorise country lists no groups`);
      continue;
    }
    const keys = new Set(computed.map((g) => g.key));
    const listed = new Set();
    for (const group of entry.groups) {
      const gw = `${w} group ${group.key}`;
      if (listed.has(group.key)) errors.push(`${gw}: listed twice`);
      listed.add(group.key);
      if (!keys.has(group.key)) {
        errors.push(`${gw}: no code of ${cc} falls in this group`);
        continue;
      }
      if (typeof group.label !== 'string' || !group.label.trim()) {
        errors.push(`${gw}: label missing`);
        continue;
      }
      const mine = computed.find((g) => g.key === group.key);
      const inGroup = list.filter((c) => patternKey(cc, c.code, entry.digits) === group.key);
      const reach = new Set(inGroup.flatMap((c) => [c.region, ...(c.spans ?? [])]));
      const named = namedRegions(group.label, map, entry.areas);
      const covered = new Set([...named.values()].flat());
      const missing = mine.regions.filter((r) => !covered.has(r));
      if (missing.length) errors.push(`${gw}: label "${group.label}" leaves out ${missing.join(', ')}`);
      for (const [needle, area] of named) {
        const outside = area.filter((r) => !reach.has(r));
        if (outside.length) errors.push(`${gw}: label names "${needle}" (${outside.join(', ')}), which has no code in the group`);
      }
    }
    for (const key of keys) if (!listed.has(key)) errors.push(`${w}: group ${key} has codes but no label`);
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = checkAreaCodePatterns({ report: process.argv.includes('--report') });
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('OK: area-code patterns match the codes');
}
