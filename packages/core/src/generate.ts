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
 * subregion, the same continent, then the rest; each group shuffled by `seed`.
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
  const region = subregionOf(self.code);
  const neighbours = rest.filter((c) => region && subregionOf(c.code) === region);
  const near = rest.filter((c) => c.continent === self.continent && !neighbours.includes(c));
  const far = rest.filter((c) => c.continent !== self.continent);
  return [...new Set(first)].concat(
    seededShuffle(neighbours, `${seed}:region`),
    seededShuffle(near, seed),
    seededShuffle(far, `${seed}:far`),
  );
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
        // a sentence naming other regions too ("frequent in RS, RJ, MS") has more than one right
        // answer on the map
        // other regions the sentence names are right too ("frequent in RS, RJ, MS"); one that only
        // hints at others has no fair single answer
        const others = map.states.filter(
          (s) => s.code !== state.code && namedIn(sameClaim(note.text), [s.name]),
        );
        const spans = others.map((s) => s.code);
        // the other right regions are masked too: a named answer would be a free click
        const asked =
          prompt &&
          maskOthers(
            prompt,
            others.map((s) => s.name),
          );
        if (!asked || BROKEN_MASK.test(asked) || (spans.length === 0 && namesOtherRegions(asked)))
          continue;
        // a region name inside a place name ("Villa Ángela", "San Pedro de Jujuy") is no answer
        if (spans.length > 0 && (PLACE_PART.test(asked) || !asked.includes('this area'))) continue;
        cards.push({
          id: `gen:${lc}:where:${noteKey(note.id, lc)}`,
          type: 'region',
          country: code,
          answer: state.code,
          ...(spans.length > 0 && { spans }),
          prompt: { kind: 'text', value: asked },
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
  /\b(?:the|an?) (?:this|another) area\b|\b(?:this|another) area['’]s\b|\b(?:this|another) area (states?|provinces?|regions?|oblasts?|county|counties|peninsula|coast|roads?|islands?|poles?|bollards?|signs?|plates?|houses?|roofs?|one)\b|\b(\w+ern|far|central|upper|lower|north|south|east|west|northeast|northwest|southeast|southwest|inner|outer)\s+(?:this|another) area\b/i;

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

/**
 * The part of a note that makes its claim: up to a contrast ("…only in Pernambuco; white ones in
 * Bahia", "… but not in …"), so a region named for a different feature is not a right answer.
 */
export function sameClaim(text: string): string {
  return text.split(/;|\.\s|\b(?:but|while|whereas|unlike|except|than|not|instead)\b/i)[0] ?? text;
}

/**
 * "Villa another area", "San Pedro de another area": the mask hit part of a place's name; "Tatar in
 * this area and Bashkir in another area": the regions differ in what they show.
 */
const PLACE_PART =
  /(?:\b[A-Z][\p{L}]+|\b(?:de|del|do|da|of))\s+another area|\bin (?:this|another) area and [\p{L}-]+ in (?:this|another) area/u;

/** Other right regions in a where prompt read "another area": naming them would give them away. */
function maskOthers(prompt: string, names: string[]): string {
  let out = prompt;
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'giu'), 'another area');
  }
  // "another area, another area and another area" reads "three other areas"
  out = out.charAt(0).toUpperCase() + out.slice(1);
  const count = (n: number) => ['', 'one', 'two', 'three', 'four', 'five'][n] ?? 'several';
  return out
    .replace(/this area(?:, another area)+,? and another area/g, (run) => {
      return `this area and ${count(run.split('another area').length - 1)} other areas`;
    })
    .replace(/another area(?:, another area)*,? and another area/g, (run) => {
      return `${count(run.split('another area').length - 1)} other areas`;
    });
}

/** Note ids are often prefixed with the country ("pl:bollard-red"); card ids drop it. */
function noteKey(id: string, lc: string): string {
  return id.startsWith(`${lc}:`) ? id.slice(lc.length + 1) : id;
}

// --- subregions ---------------------------------------------------------------------------------
// (here, not in a module of their own: Node loads this file directly for the content tools, so it
// has no runtime imports)

/**
 * The UN geoscheme subregion of each pool country, nudged where GeoGuessr sees it differently
 * (Cyprus with southern Europe, Christmas and Cocos Islands with Australia). A continent is too
 * wide to pick believable wrong answers from: Oman and Taiwan are both "Asia".
 */
const SUBREGIONS: Record<string, string[]> = {
  'northern-europe': [
    'AX',
    'DK',
    'EE',
    'FI',
    'FO',
    'GB',
    'IE',
    'IM',
    'IS',
    'JE',
    'LT',
    'LV',
    'NO',
    'SE',
    'SJ',
  ],
  'western-europe': ['AT', 'BE', 'CH', 'DE', 'FR', 'LI', 'LU', 'MC', 'NL'],
  'southern-europe': [
    'AD',
    'AL',
    'BA',
    'CY',
    'ES',
    'GI',
    'GR',
    'HR',
    'IT',
    'ME',
    'MK',
    'MT',
    'PT',
    'RS',
    'SI',
    'SM',
    'XK',
  ],
  'eastern-europe': ['BG', 'BY', 'CZ', 'HU', 'PL', 'RO', 'RU', 'SK', 'UA'],
  'western-asia': ['AE', 'GE', 'IL', 'IQ', 'JO', 'LB', 'OM', 'QA', 'TR'],
  'central-asia': ['KG', 'KZ'],
  'southern-asia': ['BD', 'BT', 'IN', 'IO', 'LK', 'NP', 'PK'],
  'south-eastern-asia': ['ID', 'KH', 'LA', 'MY', 'PH', 'SG', 'TH', 'VN'],
  'eastern-asia': ['CN', 'HK', 'JP', 'KR', 'MN', 'MO', 'TW'],
  'northern-africa': ['EG', 'TN'],
  'western-africa': ['GH', 'ML', 'NG', 'SN'],
  'eastern-africa': ['KE', 'MG', 'RE', 'RW', 'TZ', 'UG'],
  'middle-africa': ['ST'],
  'southern-africa': ['BW', 'LS', 'NA', 'SZ', 'ZA'],
  'northern-america': ['BM', 'CA', 'GL', 'PM', 'US'],
  caribbean: ['CW', 'DO', 'MQ', 'PR', 'VI'],
  'central-america': ['CR', 'GT', 'MX', 'PA'],
  'south-america': ['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GS', 'PE', 'PY', 'UY'],
  'australia-new-zealand': ['AU', 'CC', 'CX', 'NZ'],
  melanesia: ['VU'],
  micronesia: ['GU', 'MP'],
  polynesia: ['AS', 'PN'],
};

const BY_CODE = new Map(
  Object.entries(SUBREGIONS).flatMap(([region, codes]) => codes.map((code) => [code, region])),
);

/** A country's subregion ("western-asia"), or undefined for a code not listed. */
export const subregionOf = (code: string): string | undefined => BY_CODE.get(code.toUpperCase());

/**
 * Text placing a clue in more than one region ("also in Lleida", "this area and Pernambuco",
 * "other French-minority areas"): a map question with one right region would mark a right pick
 * wrong, so such clues are not asked on the map.
 */
export const namesOtherRegions = (text: string): boolean =>
  /\balso\b|\bother\b[^.]*\b(areas|regions|states|provinces|parts)\b|\band this area\b|\bthis area,? and\b|\bas well as\b|\bfrequent in\b|\bcities\b|\bsuch as\b/i.test(
    text,
  );
