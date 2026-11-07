import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    if (c.prompt && !['flag', 'text', 'image', 'embed', 'svg'].includes(c.prompt.kind)) err(`${w}: bad prompt.kind`);
    if (c.options && !c.options.includes(c.answer)) err(`${w}: options do not include answer`);
    if (c.type === 'areacode' && !/^\d{2}$/.test(c.prompt?.value ?? '')) err(`${w}: area code must be 2 digits`);
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
console.log(`OK: ${pool.length} pool, ${allCards.length} cards, ${allTips.length} tips, ${chapters.length} chapters`);
