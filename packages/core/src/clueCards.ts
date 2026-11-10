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
  resolveCodes,
  seededShuffle,
  SUBJECT_NOUNS,
} from './generate';
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
      if (!shown.has(code)) shown.set(code, { clue, image });
    }
  }
  return { pool: input.pool, names: input.names ?? [], families, showcase, sameAs };
}

/** Countries a clue cannot tell apart from its own: never offered against it. */
function lookTheSame(clue: Clue, code: string, ctx: Context): Set<string> {
  const linked = ctx.sameAs.get(clue.family)?.get(code) ?? new Set<string>();
  return new Set([...linked, ...resolveCodes(clue.sameAs ?? [], ctx.pool)]);
}

/** The clue's lookalikes and the countries it "differs" from, as pool codes. */
const closeCodes = (clue: Clue, pool: PoolCountry[]) =>
  resolveCodes([...clue.lookalikes, ...(clue.differs ?? []).map((d) => d.country)], pool);

/**
 * Other pool countries in distractor order: the clue's lookalikes and "differs" countries, then
 * same-continent countries that have a clue of the same family, then the rest of the continent,
 * then everywhere else. Each tier is shuffled by `seed`; no country appears twice, and countries
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
  const rest = others.filter((c) => !lookalikes.includes(c));
  const near = rest.filter((c) => c.continent === self.continent);
  const tiers = [
    seededShuffle(
      near.filter((c) => sharing.has(c.code)),
      `${seed}:family`,
    ),
    seededShuffle(
      near.filter((c) => !sharing.has(c.code)),
      `${seed}:near`,
    ),
    seededShuffle(
      rest.filter((c) => c.continent !== self.continent),
      `${seed}:far`,
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
      cards.push(...cardsForClue(clue, country, ctx));
    }
  }
  return cards;
}

function cardsForClue(clue: Clue, country: PoolCountry, ctx: Context): Card[] {
  const noun = SUBJECT_NOUNS[clue.family];
  const base = {
    country: country.code,
    tags: [country.continent, clue.family, 'clue'],
    subject: clue.family,
    ...(clue.region && { region: clue.region }),
    source: clue.credit.url,
    credit: clue.credit,
  };
  const cards: Card[] = [];
  // distinct example photos only, at most MAX_SPOT_PER_CLUE: comparison and annotated pictures,
  // duplicates and uncropped giveaways stay in Learn and on the answer screen
  const usable = quizImages(clue);

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
  // from a country where the clue looks the same
  const first = usable[0];
  const shown = ctx.showcase.get(clue.family);
  if (first && shown && WHICH_FAMILIES.includes(clue.family)) {
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

  // Live view: the official Street View spots the clue links to
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
    if (summary && !leaks(clue.text.map(plainText).join(' ')) && !leaks(summary)) {
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
