// Which new cards to introduce, and in what order: a curriculum instead of a random draw from
// everything unseen. Pure and deterministic: the same cards and states always give the same picks.
//
// - Countries come in COUNTRY_PRIORITY order (the learner's focus countries first). A few of them,
//   the active set, are introduced at a time: the first ACTIVE_COUNTRIES countries that still have
//   a clue card not seen yet. New clue cards are taken round-robin across the active countries; a
//   country leaves the set once all its clue cards are introduced and the next one joins.
// - Inside a country, clues come in Plonk It's order (the order clueCards emits them), the families
//   that tell countries apart most (EARLY_FAMILIES) before landscape, architecture, vegetation and
//   the rest. A clue's cards come a pair at a time, spread over types (Spot it, Which clue, Live
//   view, then its other images and spots), and at most MAX_SIBLINGS_PER_DAY of one clue are
//   introduced on one day: its other cards come on later days.
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

/** Families introduced before the rest of a country's clues. */
export const EARLY_FAMILIES: readonly MetaSubject[] = [
  'bollard',
  'pole',
  'sign',
  'plate',
  'line',
  'car',
  'coverage',
  'language',
  'guardrail',
];

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
  /** sort key inside the country: family tier, pair of the clue, clue position, card position */
  key: [number, number, number, number];
}

/** Each country's clue cards in introduction order. */
function clueQueues(cards: Card[]): Map<string, Card[]> {
  const byClue = new Map<string, Card[]>();
  for (const card of cards) {
    const id = clueOf(card);
    if (id) byClue.set(id, [...(byClue.get(id) ?? []), card]);
  }
  const byCountry = new Map<string, Ranked[]>();
  [...byClue.values()].forEach((siblings, clueIndex) => {
    const first = siblings[0] as Card;
    const tier = first.subject && EARLY_FAMILIES.includes(first.subject) ? 0 : 1;
    const turns = TYPE_TURNS.map((type) => siblings.filter((c) => c.type === type));
    const others = siblings.filter((c) => !TYPE_TURNS.includes(c.type));
    const ordered: Card[] = [];
    for (let round = 0; ordered.length < siblings.length - others.length; round++) {
      for (const turn of turns) if (turn[round]) ordered.push(turn[round] as Card);
    }
    ordered.push(...others);
    const ranked = byCountry.get(first.country) ?? [];
    ordered.forEach((card, rank) =>
      ranked.push({ card, key: [tier, Math.floor(rank / MAX_SIBLINGS_PER_DAY), clueIndex, rank] }),
    );
    byCountry.set(first.country, ranked);
  });
  const compare = (a: Ranked, b: Ranked) =>
    a.key.reduce((diff, value, i) => diff || value - (b.key[i] as number), 0);
  return new Map(
    [...byCountry].map(([country, ranked]) => [country, ranked.sort(compare).map((r) => r.card)]),
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
      .map(([code, queue]) => [code, queue.filter((card) => isNew(states, card))] as const)
      .filter(([, queue]) => queue.length > 0),
  );
  const others = otherQueue(
    fresh.filter((card) => !clueOf(card)),
    order,
  );
  const clueTotal = [...queues.values()].reduce((sum, q) => sum + q.length, 0);
  const otherCount = Math.min(
    others.length,
    Math.max(Math.round(count * OTHER_SHARE), count - clueTotal),
  );
  const clueCount = count - otherCount;

  // round-robin over the active countries; the next countries in line join only when the active
  // ones have nothing left for today, so a day is never short while clue cards remain
  const countries = order.filter((code) => queues.has(code));
  const picked: Card[] = [];
  const cursor = new Map<string, number>();
  const take = (code: string): boolean => {
    const queue = queues.get(code) as Card[];
    for (let i = cursor.get(code) ?? 0; i < queue.length; i++) {
      const card = queue[i] as Card;
      if (!roomFor(card)) continue;
      cursor.set(code, i + 1);
      today.set(clueOf(card) as string, (today.get(clueOf(card) as string) ?? 0) + 1);
      picked.push(card);
      return true;
    }
    cursor.set(code, queue.length);
    return false;
  };
  for (let size = ACTIVE_COUNTRIES; picked.length < clueCount; size++) {
    const group = countries.slice(0, size);
    let progress = true;
    while (picked.length < clueCount && progress) {
      progress = false;
      for (const code of group) {
        if (picked.length >= clueCount) break;
        if (take(code)) progress = true;
      }
    }
    if (size >= countries.length) break;
  }

  const filled = Math.min(others.length, count - picked.length);
  return weave(picked, others.slice(0, filled), filled / Math.max(1, picked.length + filled));
}
