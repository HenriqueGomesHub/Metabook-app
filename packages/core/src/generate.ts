// Turns country facts into cards: basics (driving side, domain, calling code) for the Clue quiz and
// `where` cards on regions maps. Clue-catalogue cards come from clueCards.ts. Pure and deterministic: the same input
// always yields the same cards in the same order, so generated files diff cleanly.
// Only type imports here: tools/content runs this file directly with Node's type stripping.
import type {
  Card,
  CountryFacts,
  FactNote,
  MetaSubject,
  PoolCountry,
  RegionMapNames,
} from './types';

export type GeneratedCard = Card & { verified: boolean };

export interface GenerateInput {
  pool: PoolCountry[];
  /** every country's facts; other countries feed distractors and uniqueness checks */
  facts: CountryFacts[];
  /** regions maps by upper-case country code; a country without one gets no `where` cards */
  maps?: Record<string, RegionMapNames>;
}

/**
 * Tag of text-only cards ("Websites end in .pl", a clue without a usable image): they never come
 * up in family drills, chapters or the daily session, only in the Clue quiz drill.
 */
export const CLUE_TAG = 'clue-text';

/** A text-only fact card, for the Clue quiz only. */
export const isClueCard = (card: Pick<Card, 'tags'>): boolean => card.tags.includes(CLUE_TAG);

const CHOICES = 4;
/** `where` cards are only worth a drill when a country has at least this many */
export const MIN_WHERE_CARDS = 4;

export const SUBJECT_NOUNS: Record<MetaSubject, string> = {
  bollard: 'bollard',
  pole: 'utility pole',
  plate: 'licence plate',
  sign: 'road sign',
  line: 'road line',
  guardrail: 'guardrail',
  language: 'language',
  car: 'Google car',
  landscape: 'landscape',
  street: 'street detail',
  architecture: 'architecture',
  coverage: 'coverage',
  vegetation: 'vegetation',
  other: 'clue',
};

/** FNV-1a; seeds the shuffles from card ids. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A shuffle that always comes out the same for the same seed. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let a = hash(seed);
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Codes compare case-insensitively: hand-written facts files may use "pl" or "PL". */
const same = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);

/** Resolves lookalike entries, which may be ISO codes in any case or country names. */
export function resolveCodes(entries: string[], pool: PoolCountry[]): string[] {
  return entries.flatMap((entry) => {
    const hit = pool.find(
      (c) => c.code === entry.toUpperCase() || c.name.toLowerCase() === entry.toLowerCase(),
    );
    return hit ? [hit.code] : [];
  });
}

/**
 * Other pool countries ordered for distractors: preferred (lookalikes) first, then the same
 * continent, then the rest; each group shuffled by `seed`.
 */
function rankCountries(
  self: PoolCountry,
  pool: PoolCountry[],
  preferred: string[],
  seed: string,
  allowed: (country: PoolCountry) => boolean = () => true,
): PoolCountry[] {
  const others = pool.filter((c) => c.in_pool && c.code !== self.code && allowed(c));
  const first = preferred.flatMap((code) => others.filter((c) => c.code === code));
  const rest = others.filter((c) => !first.includes(c));
  const near = rest.filter((c) => c.continent === self.continent);
  const far = rest.filter((c) => c.continent !== self.continent);
  return [...new Set(first)].concat(seededShuffle(near, seed), seededShuffle(far, `${seed}:far`));
}

/**
 * Country-name options with the answer, shuffled by `seed`; only same-continent fallbacks.
 * A country the prompt names (`prompt`: the clue or alt text) is never a distractor: "Like
 * Poland's, …" with Poland as an option has two right-looking answers.
 */
function nameOptions(
  self: PoolCountry,
  pool: PoolCountry[],
  preferred: string[],
  seed: string,
  { allowed = () => true, prompt = '', facts = [] }: NameOptionsExtra = {},
): string[] {
  const unnamed = (c: PoolCountry) =>
    !namedIn(prompt, [c.name, ...(facts.find((f) => same(f.code, c.code))?.demonym ?? [])]);
  const ok = (c: PoolCountry) => allowed(c) && unnamed(c);
  const ranked = rankCountries(self, pool, preferred, seed, ok).filter(
    (c) => preferred.includes(c.code) || c.continent === self.continent,
  );
  const picks = ranked.slice(0, CHOICES - 1).map((c) => c.name);
  return seededShuffle([self.name, ...picks], `${seed}:order`);
}

interface NameOptionsExtra {
  allowed?: (country: PoolCountry) => boolean;
  prompt?: string;
  /** every country's facts, for demonyms */
  facts?: CountryFacts[];
}

/** True when `text` contains any of `words` as a whole word, ignoring case and accents. */
export function namedIn(text: string, words: (string | undefined)[]): boolean {
  const folded = fold(text);
  return words.some((word) => {
    const w = word ? fold(word) : '';
    if (w.length < 3) return false;
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'u').test(folded);
  });
}

/**
 * True when `text` names the country: its name, a demonym or (optionally) its capital anywhere in
 * the text, or (optionally) its ISO code as a whole word; all case-insensitive.
 */
export function namesCountry(
  text: string,
  country: PoolCountry,
  facts: Pick<CountryFacts, 'demonym' | 'capital'> | undefined,
  { capital = true, code = true } = {},
): boolean {
  const lower = text.toLowerCase();
  const names = [country.name, ...(facts?.demonym ?? []), ...(capital ? [facts?.capital] : [])];
  if (names.some((n) => n && n.trim() && lower.includes(n.trim().toLowerCase()))) return true;
  return code && new RegExp(`\\b${country.code}\\b`, 'i').test(text);
}

/** Letters NFD leaves whole (Ł in Łódź, Ø in Østfold) and their plain spellings. */
const PLAIN: Record<string, string> = {
  ł: 'l',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ı: 'i',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  þ: 'th',
};

/** Lower case without accents, for comparing region names. */
const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[łøđðıßæœþ]/g, (c) => PLAIN[c] ?? c)
    .trim();

const ISO_REGION = /^([A-Za-z]{2})-([A-Za-z0-9]+)$/;

/**
 * The one map state a note's `region` names: an ISO 3166-2 code ("US-TX") whose suffix matches a
 * state code, else a state name (ignoring case and accents). Undefined when nothing or more than
 * one state matches, or the ISO prefix is another country's.
 */
export function resolveRegion(
  region: string,
  code: string,
  map: RegionMapNames,
): RegionMapNames['states'][number] | undefined {
  const iso = ISO_REGION.exec(region.trim());
  if (iso && same(iso[1] as string, code)) {
    const hits = map.states.filter((s) => same(s.code, iso[2] as string));
    if (hits.length > 0) return hits.length === 1 ? hits[0] : undefined;
  }
  const name = fold(region);
  // generated maps can hold an unnamed leftover shape (Natural Earth's "RUS+99?")
  const hits = name ? map.states.filter((s) => s.name && fold(s.name) === name) : [];
  return hits.length === 1 ? hits[0] : undefined;
}

function factsSource(facts: CountryFacts): string {
  return facts.wikidata
    ? `https://www.wikidata.org/wiki/${facts.wikidata}`
    : `https://en.wikipedia.org/wiki/${encodeURIComponent(facts.name.replace(/ /g, '_'))}`;
}

/** Cards for one country (upper-case ISO code), in a stable order. */
export function generateCards(code: string, input: GenerateInput): GeneratedCard[] {
  const country = input.pool.find((c) => same(c.code, code));
  if (!country) throw new Error(`${code} is not in pool.json`);
  code = country.code;
  const lc = code.toLowerCase();
  const facts = input.facts.find((f) => same(f.code, code));
  const notes = facts?.notes ?? [];
  const tags = (subject: MetaSubject) => [country.continent, subject, 'generated'];
  const cards: GeneratedCard[] = [];

  if (!facts) return cards;

  // (a) basics: text-only clues, tagged for the Clue quiz
  const factCard = (key: string, clue: string, allowed?: (c: PoolCountry) => boolean) => {
    const id = `gen:${lc}:${key}`;
    const options = nameOptions(country, input.pool, [], id, {
      allowed,
      prompt: clue,
      facts: input.facts,
    });
    if (options.length < 2) return;
    cards.push({
      id,
      type: 'meta',
      country: code,
      answer: country.name,
      options,
      prompt: { kind: 'text', value: clue },
      tags: [...tags('other'), CLUE_TAG],
      subject: 'other',
      source: factsSource(facts),
      verified: false,
    });
  };
  const factsOf = (c: PoolCountry) => input.facts.find((f) => same(f.code, c.code));
  /** a value another country shares makes the card ambiguous, so it is skipped */
  const unique = (value: string, field: 'tld' | 'callingCode') =>
    !input.facts.some((f) => !same(f.code, code) && (f[field] ?? []).includes(value));

  if (facts.drivingSide === 'left') {
    factCard('drive', 'Traffic drives on the left', (c) => factsOf(c)?.drivingSide === 'right');
  }
  const tld = facts.tld?.[0];
  if (tld && unique(tld, 'tld')) factCard('tld', `Websites end in ${tld}`);
  const calling = facts.callingCode?.[0];
  if (calling && unique(calling, 'callingCode')) {
    factCard('calling', `Phone numbers start ${calling}`);
  }

  // (b) where cards: click the note's state on the country's regions map
  const map = input.maps?.[code];
  if (map) {
    const where: { note: FactNote; state: RegionMapNames['states'][number] }[] = [];
    for (const note of [...notes].sort(byId)) {
      const state = note.region ? resolveRegion(note.region, code, map) : undefined;
      if (state) where.push({ note, state });
    }
    if (where.length >= MIN_WHERE_CARDS) {
      for (const { note, state } of where) {
        const prompt = hideRegionName(note.text, state.name);
        if (!prompt) continue;
        cards.push({
          id: `gen:${lc}:where:${noteKey(note.id, lc)}`,
          type: 'region',
          country: code,
          answer: state.code,
          prompt: { kind: 'text', value: prompt },
          tags: [...tags(note.subject), 'where'],
          subject: note.subject,
          explain: `${note.text} (${state.name})`,
          map: lc,
          source: note.source,
          verified: note.verified,
        });
      }
    }
  }
  return cards;
}

const REGION_WORDS =
  /\s+(voivodeship|province|state|region|prefecture|oblast|krai|county|department|district|governorate|territory)$/i;

/**
 * Words too generic to give a state away, never masked on their own: compass points, "new",
 * saints, and the administrative types maps use in names and disambiguators ("Zagreb (City)").
 */
const GENERIC_WORDS = new Set([
  'state',
  'province',
  'region',
  'island',
  'islands',
  'city',
  'territory',
  'north',
  'south',
  'east',
  'west',
  'northern',
  'southern',
  'eastern',
  'western',
  'new',
  'san',
  'santa',
  'saint',
  'voivodeship',
  'prefecture',
  'oblast',
  'krai',
  'county',
  'department',
  'district',
  'governorate',
  'municipality',
  'republic',
  'republican',
  'autonomous',
  'federal',
  'provincial',
  'urban',
  'metropolitan',
  'borough',
  'unitary',
  'authority',
]);

/** "this area" used as a modifier or after "the" reads wrongly ("this area roads"). */
const BROKEN_MASK =
  /\bthe this area\b|\bthis area['’]s\b|\bthis area (state|province|region|peninsula|coast|roads?|islands?|poles?|bollards?|signs?|plates?|houses?|roofs?)\b/i;

/**
 * The pieces of a state name that give it away: the parts between " and ", " y ", " of ", "-",
 * "/" and parentheses, and the words inside them, when 4+ letters and not generic.
 */
export function regionNameParts(stateName: string): string[] {
  const parts = stateName
    .split(/\s+(?:and|y|of)\s+|[-/()]/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const words = parts.flatMap((p) => p.split(/\s+/));
  const meaningful = (piece: string) =>
    piece.replace(/[^\p{L}]/gu, '').length >= 4 &&
    !piece.split(/\s+/).every((w) => GENERIC_WORDS.has(fold(w)));
  return [...new Set([...parts, ...words])].filter(meaningful);
}

/**
 * A `where` prompt must not name its answer: the state's name, its short form without
 * "Province", "Voivodeship"… and each meaningful part (regionNameParts) become "this area".
 * Returns undefined, so the card is skipped, when the result reads wrongly ("the this area",
 * "this area's", "this area roads") or a part is still there (another accent form).
 */
export function hideRegionName(text: string, stateName: string): string | undefined {
  const base = stateName.replace(/\s*\([^)]*\)\s*$/, '');
  const parts = regionNameParts(stateName);
  const masks = [stateName, base, base.replace(REGION_WORDS, ''), ...parts]
    .map((n) => n.trim())
    .filter((n, i, all) => n.length > 2 && all.indexOf(n) === i)
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const mask of masks) {
    const escaped = mask.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'giu'), 'this area');
  }
  if (BROKEN_MASK.test(out) || namedIn(out, masks)) return undefined;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Note ids are often prefixed with the country ("pl:bollard-red"); card ids drop it. */
function noteKey(id: string, lc: string): string {
  return id.startsWith(`${lc}:`) ? id.slice(lc.length + 1) : id;
}
