import { matchesTarget } from './blocks';
import { activePairs, CONTRAST_STREAK_TO_RESOLVE } from './confusions';
import { mulberry32, shuffle, type Rng } from './random';
import { retrievability } from './scheduler';
import type { Card, CardState, CardType, Confusion, Settings, TrainingBlock } from './types';

export type SessionMode = 'mcq' | 'recall' | 'binary' | 'map';

export interface SessionItem {
  cardId: string;
  mode: SessionMode;
  /** set on contrast rounds: [picked, truth] of the confusion being drilled */
  contrastPair?: [string, string];
}

export interface Session {
  queue: SessionItem[];
  catchUp: boolean;
  /** due reviews left out by the daily cap */
  remaining: number;
}

const MCQ_REVIEWS = 2;
const CATCH_UP_FACTOR = 3;
const NEW_SHARE = 0.3;
const BLOCK_SHARE = 0.4;
const MAX_RUN = 3;
const MAX_SIDE_RUN = 2;

/** How each type is answered once past multiple choice; area codes are recalled on the map. */
const RECALL_MODES: Partial<Record<CardType, SessionMode>> = {
  flag: 'recall',
  region: 'recall',
  script: 'recall',
  areacode: 'map',
};

export function modeFor(card: Card, state: CardState | undefined): SessionMode {
  if (card.type === 'lookalike') return 'binary';
  if ((state?.reps ?? 0) < MCQ_REVIEWS) return 'mcq';
  return RECALL_MODES[card.type] ?? 'mcq';
}

/** Spreads new cards through the reviews at about NEW_SHARE density. */
function mix<T>(reviews: T[], fresh: T[]): T[] {
  const out: T[] = [];
  let r = 0;
  let n = 0;
  while (r < reviews.length || n < fresh.length) {
    const wantNew = n < Math.floor((out.length + 1) * NEW_SHARE) || r >= reviews.length;
    out.push((wantNew && n < fresh.length ? fresh[n++] : reviews[r++]) as T);
  }
  return out;
}

/**
 * Reorders so no type runs longer than MAX_RUN, staying as close to the input order as possible.
 * Picks are checked against the remaining counts so a dominant type is not stranded at the end.
 */
function interleave(cards: Card[]): Card[] {
  const rest = [...cards];
  const out: Card[] = [];
  let runType: CardType | undefined;
  let runLength = 0;

  while (rest.length) {
    const counts = new Map<CardType, number>();
    for (const card of rest) counts.set(card.type, (counts.get(card.type) ?? 0) + 1);
    const nextRun = (type: CardType) => (type === runType ? runLength + 1 : 1);
    const feasibleAfter = (type: CardType) =>
      [...counts].every(([t, c]) => {
        const left = t === type ? c - 1 : c;
        const others = rest.length - 1 - left;
        return left <= MAX_RUN * (others + 1) - (t === type ? nextRun(type) : 0);
      });
    const fits = (card: Card) => nextRun(card.type) <= MAX_RUN;

    const index = [
      rest.findIndex((card) => fits(card) && feasibleAfter(card.type)),
      rest.findIndex(fits),
      0,
    ].find((i) => i >= 0) as number;
    const [card] = rest.splice(index, 1) as [Card];
    runLength = nextRun(card.type);
    runType = card.type;
    out.push(card);
  }
  return out;
}

function contrastItems(confusion: Confusion, cards: Card[], rng: Rng): SessionItem[] {
  const isSide = (card: Card, side: string) => card.answer === side || card.country === side;
  const sides = cards
    .filter((card) => isSide(card, confusion.truth))
    .map((truth) => [
      truth,
      cards.find((card) => card.type === truth.type && isSide(card, confusion.picked)),
    ])
    .find((pair): pair is [Card, Card] => pair[1] !== undefined);
  if (!sides) return [];

  const contrastPair: [string, string] = [confusion.picked, confusion.truth];
  const count = CONTRAST_STREAK_TO_RESOLVE - confusion.contrastStreak;
  return sideOrder(count, rng).map((side) => ({
    cardId: (sides[side] as Card).id,
    mode: 'binary' as const,
    contrastPair,
  }));
}

/** Random side order with at most MAX_SIDE_RUN in a row and both sides present (when count > 1). */
function sideOrder(count: number, rng: Rng): (0 | 1)[] {
  const order: (0 | 1)[] = [];
  for (let i = 0; i < count; i++) {
    const last = order.at(-1);
    const runs =
      order.length >= MAX_SIDE_RUN && order.slice(-MAX_SIDE_RUN).every((s) => s === last);
    const missing = i === count - 1 && count > 1 && order.every((s) => s === last);
    if (runs) order.push(last === 0 ? 1 : 0);
    else if (missing) order.push(last === 0 ? 1 : 0);
    else order.push(rng() < 0.5 ? 0 : 1);
  }
  return order;
}

/** Takes cards round-robin across types (stable within a type), with the type order shuffled. */
function roundRobinByType(cards: Card[], rng: Rng): Card[] {
  const byType = new Map<CardType, Card[]>();
  for (const card of cards) byType.set(card.type, [...(byType.get(card.type) ?? []), card]);
  const queues = shuffle([...byType.values()], rng);
  const out: Card[] = [];
  for (let round = 0; out.length < cards.length; round++) {
    for (const queue of queues) if (queue[round]) out.push(queue[round] as Card);
  }
  return out;
}

/**
 * Today's queue: contrast rounds first, then due reviews (oldest first, capped) mixed with new
 * cards, topped up with weak block-target cards to about 40%, interleaved by type.
 */
export function buildSession(input: {
  cards: Card[];
  states: Record<string, CardState>;
  confusions: Confusion[];
  settings: Settings;
  block?: TrainingBlock;
  now: Date;
  rng?: Rng;
  /** already done today; lowers the daily caps so repeat sessions don't hand out a fresh batch */
  doneToday?: { reviews: number; newCards: number };
}): Session {
  const { cards, states, confusions, block, now } = input;
  const done = input.doneToday ?? { reviews: 0, newCards: 0 };
  const settings = {
    ...input.settings,
    maxReviewsPerDay: Math.max(0, input.settings.maxReviewsPerDay - done.reviews),
    newPerDay: Math.max(0, input.settings.newPerDay - done.newCards),
  };
  const rng = input.rng ?? mulberry32(now.getTime());
  const isTarget = (card: Card) => block?.targets.some((t) => matchesTarget(card, t)) ?? false;
  const stateOf = (card: Card) => states[card.id];
  const isSeen = (card: Card) => (stateOf(card)?.state ?? 'new') !== 'new';

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = cards
    .filter((card) => isSeen(card) && Date.parse(stateOf(card)?.due ?? '') <= now.getTime())
    .sort((a, b) => (stateOf(a)?.due ?? '').localeCompare(stateOf(b)?.due ?? ''));
  const cap = settings.maxReviewsPerDay;
  const overdue = due.filter((card) => Date.parse(stateOf(card)?.due ?? '') < startOfToday);
  const catchUp = overdue.length > CATCH_UP_FACTOR * cap;
  const reviews = due.slice(0, cap);
  const fresh = catchUp
    ? []
    : [
        ...roundRobinByType(
          cards.filter((card) => !isSeen(card) && isTarget(card)),
          rng,
        ),
        ...roundRobinByType(
          cards.filter((card) => !isSeen(card) && !isTarget(card)),
          rng,
        ),
      ].slice(0, settings.newPerDay);

  const picked = new Set([...reviews, ...fresh]);
  const total = picked.size;
  const onTarget = [...picked].filter(isTarget).length;
  const missing = Math.min(
    Math.max(0, cap - reviews.length),
    Math.max(0, Math.ceil((BLOCK_SHARE * total - onTarget) / (1 - BLOCK_SHARE))),
  );
  const blockExtras = cards
    .filter((card) => isTarget(card) && isSeen(card) && !picked.has(card))
    .map((card) => ({ card, r: retrievability(stateOf(card) as CardState, now) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, missing)
    .map(({ card }) => card);

  const contrast = activePairs(confusions, now).flatMap((c) => contrastItems(c, cards, rng));
  const contrastIds = new Set(contrast.map((item) => item.cardId));
  const notContrast = (card: Card) => !contrastIds.has(card.id);
  const ordered = interleave(
    mix(
      shuffle([...reviews, ...blockExtras].filter(notContrast), rng),
      shuffle(fresh.filter(notContrast), rng),
    ),
  );
  return {
    queue: [
      ...contrast,
      ...ordered.map((card) => ({ cardId: card.id, mode: modeFor(card, stateOf(card)) })),
    ],
    catchUp,
    remaining: due.length - reviews.length,
  };
}
