// Which new cards to introduce, and in what order: a curriculum instead of a random draw from
// everything unseen. Pure and deterministic: the same cards and states always give the same picks.
//
// - Countries come in COUNTRY_PRIORITY order (the learner's focus countries first). A few of them,
//   the active set, are introduced at a time: the first ACTIVE_COUNTRIES countries that still have
//   a clue card not seen yet. New clue cards are taken round-robin across the active countries; a
//   country leaves the set once all its clue cards are introduced and the next one joins.
// - Each country's turn takes its next family in FAMILY_ROTATION (bollard, pole, sign, line, …,
//   then architecture, landscape, vegetation, other), each country starting at a different family,
//   so a day is a mix of everything rather than all bollards. No family gets more than
//   MAX_FAMILY_SHARE of a day's new clue cards while another family has cards to give.
// - Inside a family, clues come in Plonk It's order (the order clueCards emits them). A clue's
//   cards come a pair at a time, spread over types (Spot it, Which clue, Live view, then its other
//   images and spots), and at most MAX_SIBLINGS_PER_DAY of one clue are introduced on one day: its
//   other cards come on later days.
// - Clues about one region of a country come after the country-wide clues of their family, and a
//   country's where-in-the-country map cards only once half its clue cards are seen.
// - Cards not made from clues (flags, scripts, area codes, region maps) are about OTHER_SHARE of the
//   new cards, by country priority and round-robin across their types.
import type { Card, CardState, CardType, MetaSubject } from './types';

/**
 * Countries by roughly how often GeoGuessr's official maps land in them: an approximation from
 * coverage size and community experience, not measured data. Pool countries missing here follow
 * in alphabetical order of code.
 */
// prettier-ignore
export const COUNTRY_PRIORITY: readonly string[] = [
  'US', 'BR', 'RU', 'CA', 'AU', 'JP', 'FR', 'ZA', 'MX', 'AR',
  'ID', 'GB', 'ES', 'DE', 'IT', 'TR', 'PL', 'TH', 'IN', 'CL',
  'NZ', 'SE', 'NO', 'FI', 'PE', 'CO', 'MY', 'PH', 'KR', 'KE',
  'NG', 'UA', 'RO', 'PT', 'CZ', 'NL', 'BE', 'AT', 'CH', 'HU',
  'BG', 'GR', 'HR', 'RS', 'SK', 'SI', 'DK', 'IE', 'IS', 'EE',
  'LV', 'LT', 'TW', 'KH', 'BD', 'LK', 'IL', 'AE', 'EC', 'BO',
  'UY', 'GT', 'DO', 'MN', 'KZ', 'GH', 'UG', 'SN', 'BW', 'TN',
];

/** Countries being introduced at the same time. */
export const ACTIVE_COUNTRIES = 4;
/** New cards of one clue on one day. */
export const MAX_SIBLINGS_PER_DAY = 2;
/** Share of new cards that are not made from clues. */
export const OTHER_SHARE = 0.2;
/** Share of a country's clue cards seen before its where-in-the-country map cards come. */
const MAP_AFTER_SHARE = 0.5;

/** The order a country's turns go through the clue families. */
export const FAMILY_ROTATION: readonly MetaSubject[] = [
  'bollard',
  'pole',
  'sign',
  'line',
  'guardrail',
  'plate',
  'car',
  'coverage',
  'language',
  'street',
  'architecture',
  'landscape',
  'vegetation',
  'other',
];
/** Most of a day's new clue cards one family may have, while others have cards left. */
export const MAX_FAMILY_SHARE = 0.25;

const familyRank = (subject: MetaSubject | undefined): number => {
  const rank = subject ? FAMILY_ROTATION.indexOf(subject) : -1;
  return rank < 0 ? FAMILY_ROTATION.length - 1 : rank;
};

/** The order cards of one clue are introduced in, by type. */
const TYPE_TURNS: CardType[] = ['spot', 'which', 'live', 'meta'];

/** The clue a card was made from, if any. */
export const clueOf = (card: Card): string | undefined => card.clue?.id;

/** Focus countries, then COUNTRY_PRIORITY, then the rest alphabetically; each code once. */
export function countryOrder(codes: Iterable<string>, focus: readonly string[] = []): string[] {
  const all = new Set([...codes].map((code) => code.toUpperCase()));
  const ranked = [...focus.map((code) => code.toUpperCase()), ...COUNTRY_PRIORITY].filter((code) =>
    all.has(code),
  );
  const rest = [...all].filter((code) => !ranked.includes(code)).sort();
  return [...new Set([...ranked, ...rest])];
}

const isNew = (states: Record<string, CardState>, card: Card) =>
  (states[card.id]?.state ?? 'new') === 'new';

/** The countries whose clue cards are being introduced now, in curriculum order. */
export function activeCountries(
  cards: Card[],
  states: Record<string, CardState>,
  focus: readonly string[] = [],
): string[] {
  const open = new Set(cards.filter((c) => clueOf(c) && isNew(states, c)).map((c) => c.country));
  return countryOrder(open, focus).slice(0, ACTIVE_COUNTRIES);
}

interface Ranked {
  card: Card;
  /** sort key inside the country and family: pair of the clue, clue position, card position */
  key: [number, number, number, number];
}

/** Each country's clue cards by family rank (FAMILY_ROTATION index), in introduction order. */
function clueQueues(cards: Card[]): Map<string, Map<number, Card[]>> {
  const byClue = new Map<string, Card[]>();
  for (const card of cards) {
    const id = clueOf(card);
    if (id) byClue.set(id, [...(byClue.get(id) ?? []), card]);
  }
  const byCountry = new Map<string, Map<number, Ranked[]>>();
  [...byClue.values()].forEach((siblings, clueIndex) => {
    const first = siblings[0] as Card;
    const family = familyRank(first.subject);
    const turns = TYPE_TURNS.map((type) => siblings.filter((c) => c.type === type));
    const others = siblings.filter((c) => !TYPE_TURNS.includes(c.type));
    const ordered: Card[] = [];
    for (let round = 0; ordered.length < siblings.length - others.length; round++) {
      for (const turn of turns) if (turn[round]) ordered.push(turn[round] as Card);
    }
    ordered.push(...others);
    const families = byCountry.get(first.country) ?? new Map<number, Ranked[]>();
    const ranked = families.get(family) ?? [];
    // a clue for one region of the country (Kolyma, Quebec) waits behind the country-wide ones
    const regional = first.region ? 1 : 0;
    ordered.forEach((card, rank) =>
      ranked.push({
        card,
        key: [regional, Math.floor(rank / MAX_SIBLINGS_PER_DAY), clueIndex, rank],
      }),
    );
    families.set(family, ranked);
    byCountry.set(first.country, families);
  });
  const compare = (a: Ranked, b: Ranked) =>
    a.key.reduce((diff, value, i) => diff || value - (b.key[i] as number), 0);
  return new Map(
    [...byCountry].map(([country, families]) => [
      country,
      new Map(
        [...families].map(([family, ranked]) => [family, ranked.sort(compare).map((r) => r.card)]),
      ),
    ]),
  );
}

/** Cards not made from clues: by country order, round-robin across types. */
function otherQueue(cards: Card[], order: string[]): Card[] {
  const rank = new Map(order.map((code, i) => [code, i]));
  const sorted = cards
    .map((card, i) => ({ card, i }))
    .sort(
      (a, b) =>
        (rank.get(a.card.country) ?? order.length) - (rank.get(b.card.country) ?? order.length) ||
        a.i - b.i,
    )
    .map(({ card }) => card);
  const byType = new Map<CardType, Card[]>();
  for (const card of sorted) byType.set(card.type, [...(byType.get(card.type) ?? []), card]);
  const queues = [...byType.values()];
  const out: Card[] = [];
  for (let round = 0; out.length < sorted.length; round++) {
    for (const queue of queues) if (queue[round]) out.push(queue[round] as Card);
  }
  return out;
}

/** Puts `side` among `main` at about `share` density, both in order. */
function weave<T>(main: T[], side: T[], share: number): T[] {
  const out: T[] = [];
  let m = 0;
  let s = 0;
  while (m < main.length || s < side.length) {
    const wantSide = s < Math.floor((out.length + 1) * share) || m >= main.length;
    out.push((wantSide && s < side.length ? side[s++] : main[m++]) as T);
  }
  return out;
}

/**
 * Up to `count` new cards in curriculum order (see the file comment), ready to be served in this
 * order: clue cards round-robin across countries, the other cards woven in.
 */
/**
 * How much a card is worth knowing in a round: how often its country comes up (COUNTRY_PRIORITY
 * rank) times how often its kind of clue decides a round (always-visible things such as the car,
 * coverage, signs and landscape over flags and area codes). Orders reviews when a session cannot
 * hold them all.
 */
export function cardValue(card: Card): number {
  const rank = COUNTRY_PRIORITY.indexOf(card.country?.toUpperCase() ?? '');
  const country = 1 / ((rank < 0 ? COUNTRY_PRIORITY.length + 20 : rank) + 8);
  const kind = card.subject ?? card.type;
  return country * (KIND_VALUE[kind] ?? 0.5);
}

const KIND_VALUE: Record<string, number> = {
  car: 1,
  coverage: 1,
  landscape: 1,
  sign: 0.9,
  language: 0.9,
  vegetation: 0.8,
  line: 0.8,
  pole: 0.8,
  script: 0.7,
  architecture: 0.7,
  street: 0.6,
  bollard: 0.6,
  lookalike: 0.5,
  region: 0.5,
  other: 0.5,
  plate: 0.4,
  meta: 0.4,
  guardrail: 0.3,
  areacode: 0.25,
  flag: 0.15,
};

export function pickNewCards(input: {
  cards: Card[];
  states: Record<string, CardState>;
  count: number;
  /** cards first answered today: they count towards each clue's daily limit */
  introducedToday?: Iterable<string>;
  focus?: readonly string[];
}): Card[] {
  const { cards, states, focus = [] } = input;
  const count = Math.max(0, input.count);
  if (count === 0) return [];
  const fresh = cards.filter((card) => isNew(states, card));
  const order = countryOrder(
    cards.map((c) => c.country),
    focus,
  );

  const today = new Map<string, number>();
  const byId = new Map(cards.map((card) => [card.id, card]));
  for (const id of input.introducedToday ?? []) {
    const clue = byId.get(id) && clueOf(byId.get(id) as Card);
    if (clue) today.set(clue, (today.get(clue) ?? 0) + 1);
  }
  const roomFor = (card: Card) => (today.get(clueOf(card) as string) ?? 0) < MAX_SIBLINGS_PER_DAY;

  // ranked over all of a clue's cards, so a card's place does not move as its siblings are seen
  const queues = new Map(
    [...clueQueues(cards.filter((card) => clueOf(card)))]
      .map(
        ([code, families]) =>
          [
            code,
            new Map(
              [...families]
                .map(
                  ([family, queue]) =>
                    [family, queue.filter((card) => isNew(states, card))] as const,
                )
                .filter(([, queue]) => queue.length > 0),
            ),
          ] as const,
      )
      .filter(([, families]) => families.size > 0),
  );
  // where-in-the-country maps wait until half the country's clue cards are known: placing a
  // region means little before the country itself is recognised
  const clueTotals = new Map<string, { all: number; seen: number }>();
  for (const card of cards) {
    if (!clueOf(card)) continue;
    const t = clueTotals.get(card.country) ?? { all: 0, seen: 0 };
    t.all++;
    if (!isNew(states, card)) t.seen++;
    clueTotals.set(card.country, t);
  }
  const countryReady = (card: Card) => {
    const t = clueTotals.get(card.country);
    return !card.map || !t || t.seen >= t.all * MAP_AFTER_SHARE;
  };
  const others = otherQueue(
    fresh.filter((card) => !clueOf(card) && countryReady(card)),
    order,
  );
  const clueTotal = [...queues.values()].reduce(
    (sum, families) => sum + [...families.values()].reduce((n, q) => n + q.length, 0),
    0,
  );
  const otherCount = Math.min(
    others.length,
    Math.max(Math.round(count * OTHER_SHARE), count - clueTotal),
  );
  const clueCount = count - otherCount;
  const familyCap = Math.max(1, Math.ceil(clueCount * MAX_FAMILY_SHARE));

  // round-robin over the active countries, each turn the country's next family; the next countries
  // in line join only when the active ones have nothing left for today, so a day is never short
  // while clue cards remain
  const countries = order.filter((code) => queues.has(code));
  const rotation = FAMILY_ROTATION.length;
  const picked: Card[] = [];
  const perFamily = new Map<number, number>();
  /** per country: the family rank its next turn starts from; countries start a family apart */
  const nextFamily = new Map(countries.map((code, i) => [code, i % rotation]));
  const cursor = new Map<string, number>();
  const takeFrom = (code: string, family: number): boolean => {
    const queue = queues.get(code)?.get(family);
    if (!queue) return false;
    const key = `${code}:${family}`;
    for (let i = cursor.get(key) ?? 0; i < queue.length; i++) {
      const card = queue[i] as Card;
      if (!roomFor(card)) continue;
      cursor.set(key, i + 1);
      today.set(clueOf(card) as string, (today.get(clueOf(card) as string) ?? 0) + 1);
      perFamily.set(family, (perFamily.get(family) ?? 0) + 1);
      picked.push(card);
      return true;
    }
    cursor.set(key, queue.length);
    return false;
  };
  const take = (code: string, capped: boolean): boolean => {
    const start = nextFamily.get(code) ?? 0;
    for (let k = 0; k < rotation; k++) {
      const family = (start + k) % rotation;
      if (capped && (perFamily.get(family) ?? 0) >= familyCap) continue;
      if (takeFrom(code, family)) {
        nextFamily.set(code, (family + 1) % rotation);
        return true;
      }
    }
    return false;
  };
  // first within the family cap; only if that leaves the day short, past it
  for (const capped of [true, false]) {
    for (let size = ACTIVE_COUNTRIES; picked.length < clueCount; size++) {
      const group = countries.slice(0, size);
      let progress = true;
      while (picked.length < clueCount && progress) {
        progress = false;
        for (const code of group) {
          if (picked.length >= clueCount) break;
          if (take(code, capped)) progress = true;
        }
      }
      if (size >= countries.length) break;
    }
  }

  const filled = Math.min(others.length, count - picked.length);
  return weave(picked, others.slice(0, filled), filled / Math.max(1, picked.length + filled));
}
