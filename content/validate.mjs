import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { licenceOk } from '../tools/content/lib/common.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const load = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const errors = [];
const err = (m) => errors.push(m);
const isUrl = (s) => typeof s === 'string' && /^https?:\/\/\S+$/.test(s);
const uniq = (arr, label) => {
  const seen = new Set();
  for (const x of arr) { if (seen.has(x.id)) err(`${label}: duplicate id ${x.id}`); seen.add(x.id); }
};

const pool = load('pool.json');
const codes = new Set();
for (const c of pool) {
  if (!/^[A-Z]{2}$/.test(c.code ?? '')) err(`pool: bad code ${c.code}`);
  if (!c.name) err(`pool ${c.code}: missing name`);
  if (!['europe', 'asia', 'africa', 'americas', 'oceania'].includes(c.continent)) err(`pool ${c.code}: bad continent`);
  if (typeof c.in_pool !== 'boolean') err(`pool ${c.code}: in_pool must be boolean`);
  if (codes.has(c.code)) err(`pool: duplicate ${c.code}`);
  codes.add(c.code);
}

const SUBJECTS = ['bollard', 'pole', 'plate', 'sign', 'line', 'guardrail', 'language', 'car', 'landscape', 'architecture', 'other'];
const jsonFiles = (dir) => (existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter((f) => f.endsWith('.json')) : []);
const strings = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const poolNames = new Set(pool.map((c) => c.name.toLowerCase()));
// text shown before the answer must not contain the answer
const countryName = (code) => pool.find((c) => c.code === String(code ?? '').toUpperCase())?.name;
const names = (text, code) => Boolean(text && countryName(code) && text.toLowerCase().includes(countryName(code).toLowerCase()));

// facts/<code>.json: one CountryFacts; codes compare case-insensitively ("pl" or "PL")
const noteIds = new Map();
for (const f of jsonFiles('facts')) {
  const facts = load(`facts/${f}`);
  const w = `facts/${f}`;
  const code = String(facts.code ?? '').toUpperCase();
  if (`${code.toLowerCase()}.json` !== f) err(`${w}: code ${facts.code} does not match the file name`);
  if (!codes.has(code)) err(`${w}: code ${facts.code} not in pool.json`);
  if (!facts.name) err(`${w}: missing name`);
  if (facts.drivingSide != null && !['left', 'right'].includes(facts.drivingSide)) err(`${w}: bad drivingSide`);
  for (const k of ['tld', 'callingCode', 'languages', 'scripts']) if (facts[k] != null && !strings(facts[k])) err(`${w}: ${k} must be an array of strings`);
  if (!Array.isArray(facts.notes)) { err(`${w}: notes must be an array`); continue; }
  const ids = new Set();
  for (const n of facts.notes) {
    const nw = `${w} note ${n.id}`;
    for (const k of ['id', 'subject', 'text', 'source', 'checked']) if (!n[k]) err(`${nw}: missing ${k}`);
    if (ids.has(n.id)) err(`${w}: duplicate note id ${n.id}`);
    ids.add(n.id);
    if (!SUBJECTS.includes(n.subject)) err(`${nw}: bad subject ${n.subject}`);
    if (!isUrl(n.source)) err(`${nw}: source must be http(s) URL`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.checked ?? '')) err(`${nw}: checked must be YYYY-MM-DD`);
    if (typeof n.verified !== 'boolean') err(`${nw}: verified must be boolean`);
    if (n.region != null && typeof n.region !== 'string') err(`${nw}: region must be a string`);
    if (n.lookalikes != null) {
      if (!strings(n.lookalikes)) err(`${nw}: lookalikes must be an array of strings`);
      else for (const l of n.lookalikes) if (!codes.has(l.toUpperCase()) && !poolNames.has(l.toLowerCase())) err(`${nw}: lookalike "${l}" is not a pool code or name`);
    }
  }
  noteIds.set(code, ids);
}

// media/<code>.json: approved photos, each with a free licence and its credit
const mediaIds = new Set();
let mediaCount = 0;
for (const f of jsonFiles('media')) {
  const items = load(`media/${f}`);
  if (!Array.isArray(items)) { err(`media/${f}: must be an array`); continue; }
  for (const m of items) {
    const w = `media/${f} ${m.id}`;
    for (const k of ['id', 'country', 'subject', 'url', 'width', 'height', 'credit', 'licence', 'sourceUrl']) if (m[k] == null || m[k] === '') err(`${w}: missing ${k}`);
    const code = String(m.country ?? '').toUpperCase();
    if (`${code.toLowerCase()}.json` !== f) err(`${w}: country ${m.country} does not match the file name`);
    if (!codes.has(code)) err(`${w}: country ${m.country} not in pool.json`);
    if (!SUBJECTS.includes(m.subject)) err(`${w}: bad subject ${m.subject}`);
    if (!isUrl(m.sourceUrl)) err(`${w}: sourceUrl must be http(s) URL`);
    if (typeof m.licence === 'string' && !licenceOk(m.licence)) err(`${w}: licence "${m.licence}" is not CC0, public domain, CC BY or CC BY-SA`);
    if (names(m.caption, m.country)) err(`${w}: caption names the country`);
    if (m.licenceUrl != null && !isUrl(m.licenceUrl)) err(`${w}: licenceUrl must be http(s) URL`);
    if (typeof m.url === 'string' && !isUrl(m.url) && !/^approved\/[\w.-]+\.webp$/.test(m.url)) err(`${w}: url must be http(s) or approved/<id>.webp`);
    if (!Number.isInteger(m.width) || !Number.isInteger(m.height)) err(`${w}: width and height must be integers`);
    if (m.noteId != null && !noteIds.get(code)?.has(m.noteId)) err(`${w}: noteId ${m.noteId} not in facts/${code.toLowerCase()}.json`);
    if (m.giveaways != null && !strings(m.giveaways)) err(`${w}: giveaways must be an array of strings`);
    if (mediaIds.has(m.id)) err(`media: duplicate id ${m.id}`);
    mediaIds.add(m.id);
    mediaCount++;
  }
}

// cards with `map` are answered on content/maps/<map>-regions.json (br-states.json for Brazil)
const mapCache = new Map();
const mapStates = (map) => {
  if (!mapCache.has(map)) {
    const file = map === 'br' ? 'maps/br-states.json' : `maps/${map}-regions.json`;
    mapCache.set(map, /^[a-z]{2}$/.test(map) && existsSync(join(root, file)) ? new Set(load(file).states.map((s) => s.code)) : null);
  }
  return mapCache.get(map);
};

const cardFiles = readdirSync(join(root, 'cards')).filter((f) => f.endsWith('.json'));
const allCards = [];
for (const f of cardFiles) {
  const cards = load(`cards/${f}`);
  for (const c of cards) {
    const w = `cards/${f} ${c.id}`;
    for (const k of ['id', 'type', 'country', 'answer', 'prompt', 'tags', 'source']) if (c[k] == null) err(`${w}: missing ${k}`);
    if (!isUrl(c.source)) err(`${w}: source must be http(s) URL`);
    if (typeof c.verified !== 'boolean') err(`${w}: verified must be boolean`);
    if (c.country && !codes.has(c.country)) err(`${w}: country ${c.country} not in pool.json`);
    if (c.prompt?.kind === 'image') {
      for (const text of [c.prompt.alt, /\s/.test(c.prompt.value ?? '') ? c.prompt.value : undefined]) if (names(text, c.country)) err(`${w}: image alt/prompt names the country`);
    }
    if (c.prompt && !['flag', 'text', 'image', 'embed', 'svg'].includes(c.prompt.kind)) err(`${w}: bad prompt.kind`);
    if (c.subject != null && !SUBJECTS.includes(c.subject)) err(`${w}: bad subject ${c.subject}`);
    for (const id of c.media ?? []) if (!mediaIds.has(id)) err(`${w}: media ${id} not in content/media`);
    if (c.type === 'photo-choice' && !(c.options ?? []).every((id) => mediaIds.has(id))) err(`${w}: photo-choice options must be media ids`);
    if (c.options && !c.options.includes(c.answer)) err(`${w}: options do not include answer`);
    if (c.type === 'areacode' && !/^\d{2}$/.test(c.prompt?.value ?? '')) err(`${w}: area code must be 2 digits`);
    if (c.map != null) {
      const states = mapStates(c.map);
      if (!states) err(`${w}: no regions map for map "${c.map}"`);
      else if (!states.has(c.answer)) err(`${w}: answer ${c.answer} is not a state of the ${c.map} map`);
    }
    if (!Array.isArray(c.tags)) err(`${w}: tags must be array`);
    allCards.push(c);
  }
}
uniq(allCards, 'cards');

const allTips = [];
for (const f of readdirSync(join(root, 'tips')).filter((f) => f.endsWith('.json'))) {
  for (const t of load(`tips/${f}`)) {
    const w = `tips/${f} ${t.id}`;
    for (const k of ['id', 'answer', 'scope', 'text', 'source']) if (!t[k]) err(`${w}: missing ${k}`);
    if (!isUrl(t.source)) err(`${w}: source must be http(s) URL`);
    if (typeof t.verified !== 'boolean') err(`${w}: verified must be boolean`);
    allTips.push(t);
  }
}
uniq(allTips, 'tips');
const answers = new Set(allCards.map((c) => c.answer));
for (const t of allTips) if (t.answer !== 'ddd:br:pattern' && !answers.has(t.answer)) err(`tip ${t.id}: answer "${t.answer}" matches no card`);

const chapters = load('chapters.json');
uniq(chapters, 'chapters');
for (const c of chapters) for (const k of ['id', 'country', 'order', 'title', 'subtitle']) if (c[k] == null) err(`chapter ${c.id}: missing ${k}`);
const chapterIds = new Set(chapters.map((c) => c.id));
for (const c of allCards) if (c.chapter && !chapterIds.has(c.chapter)) err(`card ${c.id}: unknown chapter ${c.chapter}`);

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`OK: ${pool.length} pool, ${allCards.length} cards, ${allTips.length} tips, ${chapters.length} chapters, ${noteIds.size} facts files, ${mediaCount} photos`);
