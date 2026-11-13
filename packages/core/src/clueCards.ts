// Turns the clue catalogue (content/clues) into cards. Pure and deterministic: card ids come from
// clueCardIds, and every shuffle is seeded by the card id, so the same catalogue always yields the
// same cards with the same default options. Each showing redraws the options from the card's wider
// pool (see showing.ts), so a card that comes back does not show the same four answers again.
import { clueCardIds, quizImages } from './clues';
import type {
  Clue,
  ClueCountry,
  ClueFamily,
  ClueImage,
  ClueImageOverride,
  ClueLocation,
} from './clues';
import {
  CLUE_TAG,
  namedIn,
  namesCountry,
  namesOtherRegions,
  resolveCodes,
  seededShuffle,
  SUBJECT_NOUNS,
  subregionOf,
} from './generate';
import { COUNTRY_PRIORITY } from './curriculum';
import { haversineKm } from './geo';
import type { Card, CountryFacts, PoolCountry } from './types';

const CHOICES = 4;

/** Families with one recognisable object per country, worth a "Which is the … bollard?" card. */
export const WHICH_FAMILIES: readonly ClueFamily[] = [
  'bollard',
  'pole',
  'sign',
  'plate',
  'line',
  'guardrail',
];

/** Names a text card must not contain: demonyms and capitals, by pool code. */
export type CountryNames = Pick<CountryFacts, 'code' | 'demonym' | 'capital'>;

export interface ClueCardInput {
  /** every country's catalogue, overrides already applied (see applyClueOverrides) */
  clues: ClueCountry[];
  pool: PoolCountry[];
  names?: CountryNames[];
}

/**
 * Clue images with the admin's crops applied and hidden images left out. An override without a
 * crop keeps the catalogue's own.
 */
export function applyClueOverrides(
  countries: ClueCountry[],
  overrides: ClueImageOverride[],
): ClueCountry[] {
  if (overrides.length === 0) return countries;
  const byImage = new Map(overrides.map((o) => [o.imageId, o]));
  const fix = (image: ClueImage): ClueImage[] => {
    const override = byImage.get(image.id);
    if (!override) return [image];
    if (override.hidden) return [];
    return [override.crop ? { ...image, crop: override.crop } : image];
  };
  return countries.map((country) => ({
    ...country,
    clues: country.clues.map((clue) => ({ ...clue, images: clue.images.flatMap(fix) })),
  }));
}

/** Clues in Plonk It's reading order: by step, then position in the step. */
export const byStep = (a: Clue, b: Clue) => a.step - b.step || a.order - b.order;

/** Markdown reduced to plain text: link text kept, emphasis marks dropped. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const NOTE = /^\s*(\*\*)?note\b/i;
const SUMMARY_MAX = 220;

/**
 * A clue as one short question line: its first paragraph that is not a NOTE, as plain text, cut
 * after the last whole sentence that fits SUMMARY_MAX. The title is left out (it can name the
 * family the answer screen shows anyway).
 */
export function clueSummary(clue: Pick<Clue, 'text'>): string {
  const paragraph = clue.text.find((p) => !NOTE.test(p) && plainText(p)) ?? '';
  const text = plainText(paragraph);
  if (text.length <= SUMMARY_MAX) return text;
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  let out = '';
  for (const sentence of sentences) {
    if ((out + sentence).trim().length > SUMMARY_MAX) break;
    out += sentence;
  }
  return out.trim() || `${text.slice(0, SUMMARY_MAX - 1).replace(/\s+\S*$/, '')}…`;
}

const same = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

/** The embed's zoom when a spot has no usable field of view. */
const DEFAULT_ZOOM = 0.7820865974627469;

/**
 * The share embed's `!5f` value for a field of view: a zoom level, not degrees. Zoom 0 is a 180°
 * view and each level halves it, so zoom = log2(180 / fov), fov clamped to 10..120°.
 */
export function streetViewZoom(fov: number | undefined): number {
  if (fov === undefined || !Number.isFinite(fov) || fov <= 0) return DEFAULT_ZOOM;
  const clamped = Math.min(120, Math.max(10, fov));
  return Math.round(Math.log2(180 / clamped) * 1000) / 1000;
}

/** The Google share-embed URL for a Street View spot; it only works inside an iframe. */
export function streetViewEmbedUrl(location: ClueLocation): string | undefined {
  if (!location.pano) return undefined;
  const { pano, lat, lng, heading, pitch, fov } = location;
  return (
    'https://www.google.com/maps/embed?pb=!4v0!6m8!1m7' +
    `!1s${pano}!2m2!1d${lat}!2d${lng}!3f${heading}!4f${pitch}!5f${streetViewZoom(fov)}`
  );
}

/** Distractor pool size past the lookalikes: each showing picks from these. */
const POOL_EXTRA = 6;

interface Context {
  pool: PoolCountry[];
  names: CountryNames[];
  /** pool codes with at least one clue of each family */
  families: Map<ClueFamily, Set<string>>;
  /** per family, per country: the image a Which clue card shows for that country */
  showcase: Map<ClueFamily, Map<string, { clue: Clue; image: ClueImage }>>;
  /**
   * Per family, per country: the countries where that family's clue looks the same, both ways
   * round (Albania's bollard lists Italy, so Italy's bollard cards leave out Albania too).
   */
  sameAs: Map<ClueFamily, Map<string, Set<string>>>;
}

function context(input: ClueCardInput): Context {
  const families = new Map<ClueFamily, Set<string>>();
  const showcase = new Map<ClueFamily, Map<string, { clue: Clue; image: ClueImage }>>();
  const sameAs = new Map<ClueFamily, Map<string, Set<string>>>();
  const link = (family: ClueFamily, a: string, b: string) => {
    if (!sameAs.has(family)) sameAs.set(family, new Map());
    const byCountry = sameAs.get(family)!;
    if (!byCountry.has(a)) byCountry.set(a, new Set());
    byCountry.get(a)!.add(b);
  };
  for (const country of [...input.clues].sort((a, b) => a.country.localeCompare(b.country))) {
    const code = country.country.toUpperCase();
    for (const clue of [...country.clues].sort(byStep)) {
      if (!families.has(clue.family)) families.set(clue.family, new Set());
      families.get(clue.family)!.add(code);
      for (const other of resolveCodes(clue.sameAs ?? [], input.pool)) {
        if (other === code) continue;
        link(clue.family, code, other);
        link(clue.family, other, code);
      }
      const image = quizImages(clue)[0];
      if (!image) continue;
      if (!showcase.has(clue.family)) showcase.set(clue.family, new Map());
      const shown = showcase.get(clue.family)!;
      // a country's showcase is its country-wide clue: its first, unless that one is local or rare
      const held = shown.get(code);
      const plain = (c: Clue) => isCountryWide(c);
      if (!held || (!plain(held.clue) && plain(clue))) shown.set(code, { clue, image });
    }
  }
  return { pool: input.pool, names: input.names ?? [], families, showcase, sameAs };
}

/** The countries GeoGuessr lands in often enough to be worth offering as a distractor. */
const COMMON_COUNTRIES = 80;
const COMMON = new Set(COUNTRY_PRIORITY.slice(0, COMMON_COUNTRIES));
const isCommon = (code: string) => COMMON.has(code.toUpperCase());

/**
 * A gallery (GeoHints photo sets with no rule of their own: "Bollard: more examples", "Give way
 * sign: design"): shown in Learn beside the country's other clues, never quizzed, since there is
 * nothing to learn from it alone. Their generated summaries say so ("Give way signs you can see
 * here.", "Speed limit signs seen here: 20, 30…").
 */
export const isGalleryClue = (clue: Pick<Clue, 'title' | 'summary'>): boolean =>
  /more examples/i.test(clue.title) || /\b(you can see|seen) here\b/i.test(clue.summary ?? '');

/** Countries a clue cannot tell apart from its own: never offered against it. */
function lookTheSame(clue: Clue, code: string, ctx: Context): Set<string> {
  const linked = ctx.sameAs.get(clue.family)?.get(code) ?? new Set<string>();
  return new Set([
    ...linked,
    ...resolveCodes(clue.sameAs ?? [], ctx.pool),
    ...sharedInSummary(clue, code, ctx),
  ]);
}

/** A sentence saying another country has the same thing ("Albania uses the same", "also in…"). */
const SHARING = /\b(same|shares?|shared|like|also|too|as in|similar)\b/i;

/**
 * Countries the clue's own summary says share it: an option a learner could rightly pick. Only
 * the summary is read (the shipped catalogue loads the full text later).
 */
function sharedInSummary(clue: Clue, code: string, ctx: Context): string[] {
  const sentences = (clue.summary ?? '').split(/(?<=[.;!?])\s+/).filter((s) => SHARING.test(s));
  if (sentences.length === 0) return [];
  return ctx.pool
    .filter((c) => c.code !== code)
    .filter((c) => {
      const names = [c.name, ...(ctx.names.find((n) => same(n.code, c.code))?.demonym ?? [])];
      return sentences.some((s) => namedIn(s, names));
    })
    .map((c) => c.code);
}

/** The clue's lookalikes and the countries it "differs" from, as pool codes. */
const closeCodes = (clue: Clue, pool: PoolCountry[]) =>
  resolveCodes([...clue.lookalikes, ...(clue.differs ?? []).map((d) => d.country)], pool);

/**
 * Other pool countries in distractor order: the clue's lookalikes and "differs" countries, then
 * same-subregion countries (Western Asia, South America) with a clue of the same family, the rest
 * of the subregion, then the same two tiers for the continent, then everywhere else. Each tier is shuffled by `seed`; no country appears twice, and countries
 * where the clue looks the same (sameAs) are left out. `close` counts the first tier.
 */
function rankOthers(
  self: PoolCountry,
  clue: Clue,
  ctx: Context,
  seed: string,
  allowed: (c: PoolCountry) => boolean = () => true,
): PoolCountry[] & { close?: number } {
  const twins = lookTheSame(clue, self.code, ctx);
  const others = ctx.pool.filter(
    (c) => c.in_pool && c.code !== self.code && !twins.has(c.code) && allowed(c),
  );
  const lookalikes = [...new Set(closeCodes(clue, ctx.pool))].flatMap((code) =>
    others.filter((c) => c.code === code),
  );
  const sharing = ctx.families.get(clue.family) ?? new Set<string>();
  // a rarely seen country is only a distractor for another rare one: next to a big country it is
  // ruled out at a glance, and the answer is got without knowing the clue
  const minor = (c: PoolCountry) => !isCommon(c.code);
  const rest = others.filter((c) => !lookalikes.includes(c) && (minor(self) || !minor(c)));
  const region = subregionOf(self.code);
  const neighbours = rest.filter((c) => region && subregionOf(c.code) === region);
  const near = rest.filter((c) => c.continent === self.continent && !neighbours.includes(c));
  const kept = new Set([...lookalikes, ...rest]);
  const tiers = [
    seededShuffle(
      neighbours.filter((c) => sharing.has(c.code)),
      `${seed}:region-family`,
    ),
    seededShuffle(
      neighbours.filter((c) => !sharing.has(c.code)),
      `${seed}:region`,
    ),
    seededShuffle(
      near.filter((c) => sharing.has(c.code)),
      `${seed}:family`,
    ),
    seededShuffle(
      near.filter((c) => !sharing.has(c.code)),
      `${seed}:near`,
    ),
    seededShuffle(
      rest.filter((c) => c.continent !== self.continent && sharing.has(c.code)),
      `${seed}:far`,
    ),
    seededShuffle(
      rest.filter((c) => c.continent !== self.continent && !sharing.has(c.code)),
      `${seed}:farther`,
    ),
    // rare countries last, so a short pool still fills
    seededShuffle(
      others.filter((c) => !kept.has(c)),
      `${seed}:rare`,
    ),
  ];
  const ranked: PoolCountry[] & { close?: number } = [...new Set([...lookalikes, ...tiers.flat()])];
  ranked.close = lookalikes.length;
  return ranked;
}

/**
 * The answer and three distractor names, shuffled by the card id (the first showing), and the
 * wider pool later showings draw from.
 */
function countryOptions(self: PoolCountry, clue: Clue, ctx: Context, seed: string, prompt = '') {
  const unnamed = (c: PoolCountry) =>
    !prompt ||
    !namedIn(prompt, [c.name, ...(ctx.names.find((n) => same(n.code, c.code))?.demonym ?? [])]);
  const ranked = rankOthers(self, clue, ctx, seed, unnamed);
  const close = ranked.close ?? 0;
  const distractors = ranked.slice(0, close + POOL_EXTRA).map((c) => c.name);
  const options = seededShuffle([self.name, ...distractors.slice(0, CHOICES - 1)], `${seed}:order`);
  return { options, pool: { distractors, close } };
}

/** Cards for every clue of every country in `input.clues`, in country, step and clue order. */
export function clueCards(input: ClueCardInput): Card[] {
  const ctx = context(input);
  const cards: Card[] = [];
  const countries = [...input.clues].sort((a, b) => a.country.localeCompare(b.country));
  for (const entry of countries) {
    const country = input.pool.find((c) => same(c.code, entry.country));
    if (!country) continue;
    for (const clue of [...entry.clues].sort(byStep)) {
      if (isGalleryClue(clue)) continue;
      cards.push(...cardsForClue(clue, country, ctx));
    }
  }
  return cards;
}

function cardsForClue(clue: Clue, country: PoolCountry, ctx: Context): Card[] {
  const noun = SUBJECT_NOUNS[clue.family];
  const base = {
    country: country.code,
    // a clue for part of the country is learnt after the country-wide ones (curriculum, practice)
    tags: [country.continent, clue.family, 'clue', ...(isCountryWide(clue) ? [] : [LOCAL_TAG])],
    subject: clue.family,
    ...(clue.region && { region: clue.region }),
    source: clue.credit.url,
    credit: clue.credit,
  };
  const cards: Card[] = [];
  // distinct example photos only, at most MAX_SPOT_PER_CLUE: comparison and annotated pictures,
  // duplicates and uncropped giveaways stay in Learn and on the answer screen
  const usable = quizImages(clue);
  // a clue that cannot tell the country apart is only asked about inside the country (its map)
  // nor does one that holds for part of the country or one spot: it is learnt in Learn and, when
  // it has a region, on the country's map ("which country?" would teach that spot as the country)
  if (!decidesCountry(clue, lookTheSame(clue, country.code, ctx).size) || !isCountryWide(clue)) {
    return cardsOnMap(clue, country, base, usable);
  }

  // Spot it: one per image a drill may show
  for (const image of usable) {
    const id = clueCardIds.spot(clue.id, image.id);
    const { options, pool } = countryOptions(country, clue, ctx, id);
    cards.push({
      ...base,
      id,
      type: 'spot',
      answer: country.name,
      options,
      prompt: {
        kind: 'image',
        value: image.src,
        alt: `Photo of a ${noun}`,
        credit: clue.credit.source,
        creditUrl: clue.credit.url,
      },
      clue: { id: clue.id, image, ...pool },
    });
  }

  // Which clue: this country's image among three other countries' of the same family, never one
  // from a country where the clue looks the same. Only a country-wide clue stands for the country:
  // "the Colombia licence plate" is not the one plate of one department
  const first = usable[0];
  const shown = ctx.showcase.get(clue.family);
  if (first && shown && WHICH_FAMILIES.includes(clue.family) && isCountryWide(clue)) {
    const id = clueCardIds.which(clue.id);
    const ranked = rankOthers(country, clue, ctx, id, (c) => shown.has(c.code));
    const closeSet = new Set(ranked.slice(0, ranked.close ?? 0).map((c) => c.code));
    const alternates = ranked
      .map((c) => ({ country: c.code, ...shown.get(c.code)! }))
      .filter((o) => o.image.id !== first.id)
      .slice(0, CHOICES - 1 + POOL_EXTRA)
      .map((o) => ({ country: o.country, clueId: o.clue.id, image: o.image }));
    if (alternates.length >= CHOICES - 1) {
      const choices = seededShuffle(
        [{ country: country.code, clueId: clue.id, image: first }, ...alternates.slice(0, 3)],
        `${id}:order`,
      );
      cards.push({
        ...base,
        id,
        type: 'which',
        answer: first.id,
        options: choices.map((c) => c.image.id),
        prompt: { kind: 'text', value: `Which is the ${country.name} ${noun}?` },
        clue: {
          id: clue.id,
          image: first,
          choices,
          alternates,
          close: alternates.filter((a) => closeSet.has(a.country)).length,
        },
      });
    }
  }

  cards.push(...cardsOnMap(clue, country, base, usable));

  // Live view: the official Street View spots the clue links to, for clues that hold across the
  // country (a spot on one road teaches that road, not the country)
  if (isCountryWide(clue))
    clue.locations.forEach((location, index) => {
      const url = streetViewEmbedUrl(location);
      if (!url) return;
      const id = clueCardIds.live(clue.id, index);
      const { options, pool } = countryOptions(country, clue, ctx, id);
      cards.push({
        ...base,
        id,
        type: 'live',
        answer: country.name,
        options,
        prompt: { kind: 'embed', value: url },
        clue: { id: clue.id, location, ...pool },
      });
    });

  // Text: a clue with nothing to show becomes a Clue quiz question, unless it names the country
  if (usable.length === 0) {
    const names = ctx.names.find((n) => same(n.code, country.code));
    const leaks = (text: string) => namesCountry(text, country, names, { code: false });
    // the reviewed plain-language summary when it does not name the country, else the text's
    const summary = clue.summary && !leaks(clue.summary) ? clue.summary.trim() : clueSummary(clue);
    if (
      summary &&
      !leaks(clue.text.map(plainText).join(' ')) &&
      !leaks(summary) &&
      fairQuestion(summary, clue, lookTheSame(clue, country.code, ctx).size)
    ) {
      const id = clueCardIds.text(clue.id);
      const { options, pool } = countryOptions(country, clue, ctx, id, summary);
      cards.push({
        ...base,
        id,
        type: 'meta',
        tags: [...base.tags, CLUE_TAG],
        answer: country.name,
        options,
        prompt: { kind: 'text', value: summary },
        clue: { id: clue.id, ...pool },
      });
    }
  }
  return cards;
}

/** Clue quiz questions longer than this read as a paragraph, not a question. */
const QUIZ_MAX_CHARS = 140;
/** Advice on how to play, not a feature of a country ("…can help you narrow down…"). */
const ADVICE = /\b(can help|help you|narrow (it )?down|is a good clue|are a good clue|useful)\b/i;
/** Counted trivia ("124 places end in -roth"): the number is not the lesson. */
const COUNTED = /\b\d+ (places|towns|villages|cities)\b/i;
/** A clue shared by more countries than this does not decide "which country". */
const MAX_SHARED = 3;
/** A clue shared by more countries than this cannot be answered from its text alone. */
const QUIZ_MAX_SHARED = MAX_SHARED;

/**
 * Whether a text clue makes a fair Clue quiz question: short, shared by few countries, and naming
 * no place inside the country ("…in the west coast state (Gujarat)" gives India away).
 */
function fairQuestion(summary: string, clue: Clue, shared: number): boolean {
  if (summary.length > QUIZ_MAX_CHARS || shared > QUIZ_MAX_SHARED) return false;
  if (/\(/.test(summary) || ADVICE.test(summary) || COUNTED.test(summary)) return false;
  return !clue.region || !fold(summary).includes(fold(clue.region));
}

/** What every card made from one clue shares. */
type ClueCardBase = Pick<Card, 'country' | 'tags' | 'source'> & Partial<Card>;

/**
 * Where in the country: a regional clue is also asked at its own level, on the country's map,
 * so "Bollard: white rectangle on top" is learnt as Oregon and not only as the US.
 */
function cardsOnMap(
  clue: Clue,
  country: PoolCountry,
  base: ClueCardBase,
  usable: ClueImage[],
): Card[] {
  const first = usable[0];
  if (!clue.regionCode || !first) return [];
  // several regions are right when the clue names them (alsoRegions); one that only hints at
  // others ("other French-minority areas") has no fair single answer. Title and summary only: the
  // shipped catalogue loads the full text later
  const also = clue.alsoRegions ?? [];
  if (also.length === 0 && namesOtherRegions(`${clue.title} ${clue.summary ?? ''}`)) return [];
  return [
    {
      ...base,
      id: clueCardIds.where(clue.id),
      type: 'region',
      map: country.code.toLowerCase(),
      answer: clue.regionCode,
      ...(also.length > 0 && { spans: also }),
      prompt: { kind: 'text', value: clue.title },
      clue: { id: clue.id, image: first },
    },
  ];
}

/** Clues the source itself calls rare: true, but not what tells a country apart. */
const RARE =
  /\b(very uncommon|uncommon|not very common|rarely|rare|occasionally)\b|\bonce you know\b|\bonly to confirm\b|\bonly on the [A-Z]?\d|\bone (central )?town\b|\ba small [a-z ]*town\b|\b\d+ hairpins?\b|\bonly in (one|two|three) /i;

/**
 * Words a clue uses for one spot or one part of the country: a numbered road ("RN65", "E45"),
 * "the capital", an airport or park, "one northern road", "in the far north", "some states".
 */
const SPOT =
  /\b(?:the capital|capital city|(?:second[- ])?(?:biggest|largest) city|airport|national park|fort\b|biosphere|one (?:\w+ )?(?:road|highway|street|island|town|city|village|valley|stretch|municipality)|a (?:single|few) roads?|(?:in|on) the (?:far |very far )?(?:north|south|east|west|north-?east|north-?west|south-?east|south-?west)(?:ern)?\b|(?:north|south|east|west)ern (?:half|part|third|tip|coast|interior)|far-(?:north|south|east|west)|of the country|some (?:states|provinces|regions|areas|parts|islands|cities|towns)|parts of|larger islands|-region|\bfar (?:north|south|east|west)|(?:north|south|east|west|central)(?:-?(?:east|west))?(?:ern)? (?:\w+ )?(?:town|towns|city|cities|village|villages|desert|coast|coasts|island|islands|region|valley|plain|highlands?)\b|\bborder\b|neighbouring cities|driving (?:north|south|east|west)|running (?:north|south|east|west))/i;

/** A numbered road ("Route 9", "RN65", "D3600"), a compass bearing, "in western Kasur". */
const ROAD =
  /\b(?:Route|Ruta|Road|road|Rodovia|Highway|highway|Autoroute|[A-Z]{1,3})[- ]?\d{1,4}\b|\b[NSEW]{1,3} to [NSEW]{1,3}\b|\b(?:[Ii]n|[Aa]round|[Nn]ear) (?:western|eastern|northern|southern|central|north-?\w+|south-?\w+) \p{Lu}/u;

/** A preposition before a capitalised name: "in Idaho", "around Locumba", "unique to Otago". */
const PLACE =
  /\b(?:[Ii]n|[Aa]round|[Nn]ear|[Oo]utside|[Aa]cross|[Tt]hroughout|unique to|exclusive to|specific to|limited to|of|east of|west of|north of|south of)\s+(?:the\s+)?(?=\p{Lu})/gu;

/** Capitalised words after "in" that are not places: scripts, languages, seasons, the source. */
const NOT_A_PLACE =
  /^(?:Cyrillic|Latin|Arabic|English|Gen|Generation|Google|Street|Summer|Winter|Spring|Autumn|Fall|January|February|March|April|May|June|July|August|September|October|November|December|Plonk|Learnable|The|A|An|[A-Z][a-z]*(?:ish|ese|ic|ian|an|sh|ch))\b/u;

let countryNames: string[] | undefined;
/** Every country and territory name in English (lower case), plus continents and big regions. */
function countryNamesLower(): string[] {
  if (!countryNames) {
    const names = ['macau', 'turkey', 'ivory coast', 'czech republic', 'us', 'usa', 'uk'];
    names.push('europe', 'asia', 'africa', 'america', 'oceania', 'scandinavia', 'balkans');
    names.push('caribbean', 'baltics', 'middle east', 'latin america', 'southeast asia');
    try {
      const display = new Intl.DisplayNames(['en'], { type: 'region' });
      for (let a = 65; a < 91; a++) {
        for (let b = 65; b < 91; b++) {
          const code = String.fromCharCode(a, b);
          try {
            const name = display.of(code);
            if (name && name !== code) names.push(name.replace(/ SAR China$/, '').toLowerCase());
          } catch {
            // not a region code
          }
        }
      }
    } catch {
      // no Intl.DisplayNames: the short list above
    }
    countryNames = names;
  }
  return countryNames;
}

/** Whether a text pins its clue to part of a country: a spot word, or a named place in it. */
export function namesPartOfCountry(text: string): boolean {
  if (SPOT.test(text) || ROAD.test(text)) return true;
  const countries = countryNamesLower();
  for (const match of text.matchAll(PLACE)) {
    const rest = text.slice((match.index ?? 0) + match[0].length);
    if (NOT_A_PLACE.test(rest)) continue;
    const lower = rest.toLowerCase();
    if (!countries.some((name) => lower.startsWith(name))) return true;
  }
  return false;
}

/** Title words a clue of these families must start with: a bus box filed under Bollards is not one. */
const FAMILY_WORDS: Partial<Record<ClueFamily, RegExp>> = {
  bollard: /^(?:bollard|reflector|marker post|post)/i,
  plate: /^(?:plate|licen[cs]e plate|number plate)/i,
  pole: /^(?:pole|insulator|transformer|crossbar|guy|utility|pole plate|pole sticker|pole marking)/i,
  guardrail: /^(?:guardrail|guard rail|barrier|railing)/i,
};

/** Capitalised words a clue may use that are not places. */
const NOT_PROPER =
  /^(?:Gen|Generation|Google|Street|View|Trekker|Plonk|Learnable|Meta|GeoHints|Cyrillic|Latin|Arabic|English|Europe|European|Asia|Asian|Africa|African|America|American|Americas|Oceania|Balkan|Balkans|Nordic|Scandinavian|Caribbean|Mediterranean|Muslim|Christian|Catholic|Orthodox|Buddhist|Hindu|Islamic|Gothic|Art|Nouveau|Soviet|Roman|British|French|Spanish|Portuguese|German|Russian|Chinese|Japanese|Korean|Dutch|Italian|Greek|Thai|Lao|Khmer|Hebrew|Bengali|Hindi|Devanagari|Tamil|Sinhala|Georgian|Armenian|SUV|ID|A|B|C|D|E|F|K|M|N|S|T|U|V|X|Y|Z|I|II|OK|Yes|No|North|South|East|West|Central)$/;

/**
 * Whether a clue holds across its country and can be told from one photo: not local, not rare,
 * not a summary that only repeats its title, no place named anywhere (not just after "in": "Kanto
 * insulators", "Mount Gilboa"), and filed under the family its title names. Only these clues stand
 * for the country in a question (Spot it, Which clue, Live view, placement, "How to spot" notes).
 */
export function isCountryWide(
  clue: Pick<Clue, 'title' | 'summary' | 'region' | 'local' | 'family'>,
): boolean {
  if (isLocalClue(clue) || isRareClue(clue)) return false;
  // the words after the family ("Pole: concrete cross"); a bare "Bollard" names nothing
  const name = clue.title.includes(':') ? clue.title.replace(/^[^:]*:\s*/, '') : '';
  const summary = clue.summary?.trim() ?? '';
  if (summary && restates(name, summary)) return false;
  const family = FAMILY_WORDS[clue.family];
  if (family && !family.test(clue.title)) return false;
  // the title's own words are lower case ("concrete cross"): a capital there is a name ("Kanto
  // insulators"), so the title is read with a word before it
  return !namesProperPlace(`x ${name}. ${summary}`);
}

/** A summary that adds nothing to the title ("Pole: long horizontal ID" → "A long, horizontal pole ID."). */
function restates(title: string, summary: string): boolean {
  const words = (text: string) =>
    new Set(
      fold(text)
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length > 3),
    );
  const own = words(title);
  const told = [...words(summary)].filter((w) => !own.has(w) && !/^(?:pole|poles)$/.test(w));
  return told.length < 2;
}

/** A capitalised word inside a sentence that is not a country, a script or a common term. */
function namesProperPlace(text: string): boolean {
  const countries = countryNamesLower();
  for (const sentence of text.split(/(?<=[.!?;:])\s+/)) {
    const words = [...sentence.matchAll(/(?<=\s)(\p{Lu}[\p{L}'’-]*)/gu)];
    for (const match of words) {
      const word = match[1] ?? '';
      if (NOT_PROPER.test(word) || /^\p{Lu}+$/u.test(word)) continue;
      const rest = sentence.slice(match.index ?? 0).toLowerCase();
      if (countries.some((n) => rest.startsWith(n))) continue;
      // the second word of a country name ("South Africa", "New Zealand")
      const from = sentence.lastIndexOf(' ', (match.index ?? 1) - 2) + 1;
      if (countries.some((n) => sentence.slice(from).toLowerCase().startsWith(n))) continue;
      return true;
    }
  }
  return false;
}

/** Tag of clue cards for part of the country: taught after the country-wide clues. */
export const LOCAL_TAG = 'local';

/**
 * Whether a clue belongs to part of the country: it has a region, the content pipeline found a
 * map region named in it (`local`), or its own words pin it to a place.
 */
export const isLocalClue = (clue: Pick<Clue, 'title' | 'summary' | 'region' | 'local'>): boolean =>
  Boolean(clue.region) ||
  Boolean(clue.local) ||
  namesPartOfCountry(`${clue.title} ${clue.summary ?? ''}`);

/** Whether the source itself says a clue is rare, or it describes one spot (a road, a town). */
export const isRareClue = (clue: Pick<Clue, 'title' | 'summary'>): boolean =>
  RARE.test(`${clue.title} ${clue.summary ?? ''}`);

/**
 * Whether a clue can decide "which country?": not one the source calls rare, and not one that
 * looks the same in more than a few other countries.
 */
function decidesCountry(clue: Clue, shared: number): boolean {
  return shared <= MAX_SHARED && !isRareClue(clue);
}

/** A clue with its Street View spots: its own locations and those of its images. */
const spotsOf = (clue: Clue): ClueLocation[] => [
  ...clue.locations,
  ...clue.images.flatMap((image) => (image.location ? [image.location] : [])),
];

const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** True when a clue's region text and a round's region name each other (accents and case aside). */
export function regionMatches(clueRegion: string | undefined, region: string | undefined): boolean {
  if (!clueRegion || !region) return false;
  const a = fold(clueRegion);
  const b = fold(region);
  return a.length > 1 && b.length > 1 && (a.includes(b) || b.includes(a));
}

export const NEAR_KM = 300;

/**
 * A round's clues in study order: those whose region matches the round's region first, then those
 * with a Street View spot within NEAR_KM of the round's location, then the rest; each group keeps
 * Plonk It's order.
 */
export function orderRoundClues(
  clues: Clue[],
  where: { region?: string; lat?: number; lng?: number },
): Clue[] {
  const sorted = [...clues].sort(byStep);
  const { lat, lng } = where;
  const near = (clue: Clue) =>
    lat !== undefined &&
    lng !== undefined &&
    spotsOf(clue).some(
      (spot) => haversineKm({ lat, lon: lng }, { lat: spot.lat, lon: spot.lng }) <= NEAR_KM,
    );
  const regional = sorted.filter((clue) => regionMatches(clue.region, where.region));
  const close = sorted.filter((clue) => !regional.includes(clue) && near(clue));
  const rest = sorted.filter((clue) => !regional.includes(clue) && !close.includes(clue));
  return [...regional, ...close, ...rest];
}
