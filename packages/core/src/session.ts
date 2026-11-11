import { matchesTarget } from './blocks';
import { activePairs, CONTRAST_STREAK_TO_RESOLVE, isMapKey } from './confusions';
import { cardValue, clueOf, pickNewCards } from './curriculum';
import { mulberry32, shuffle, type Rng } from './random';
import { retrievability } from './scheduler';
import type { Card, CardState, CardType, Confusion, Settings, TrainingBlock } from './types';

export type SessionMode = 'mcq' | 'recall' | 'binary' | 'map';

export interface SessionItem {
  cardId: string;
  mode: SessionMode;
  /** set on contrast rounds: [picked, truth] of the confusion being drilled */
  contrastPair?: [string, string];
  /** practice: a Spot it card shown with this other image of its clue (see cardForItem) */
  imageId?: string;
  /** a session card coming back after a wrong answer */
  retry?: boolean;
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
/** Contrast questions in one day's session, one per confused pair. */
const MAX_CONTRAST = 4;

// The daily session is time-boxed (settings.sessionMinutes): estimated seconds per card, a review
// costing more the likelier it is to be missed (a miss comes back until right).
const REVIEW_SECONDS = 8;
const RETRY_SECONDS = 14;
const NEW_SECONDS = 16;
/** New cards a day even when reviews fill the session, so learning never stops. */
const MIN_NEW = 5;
export const DEFAULT_SESSION_MINUTES = 20;

/** Estimated seconds a review takes, with the expected cost of answering it again after a miss. */
const reviewSeconds = (recall: number) => REVIEW_SECONDS + RETRY_SECONDS * (1 - recall);

/**
 * How many times the usual new cards a day to offer: a learner who gets most new cards right the
 * first time (they already knew them) takes more at once, since a card already known costs a
 * few seconds and then rests for weeks. `recent` = the new cards first answered in the last week;
 * a returning player starts high before there is a week to go by.
 */
/**
 * Estimated seconds a new card takes: a card the learner already knows is answered in a few
 * seconds and passed, so the more first answers are right, the more new cards fit the session.
 */
export function newCardSeconds(
  recent: { answered: number; right: number },
  returning = false,
): number {
  const rate = recent.answered >= 20 ? recent.right / recent.answered : returning ? 0.75 : 0.4;
  return Math.min(NEW_SECONDS, Math.round(5 + ((NEW_SECONDS - 5) * (1 - rate)) / 0.6));
}

export function intakeFor(recent: { answered: number; right: number }, returning = false): number {
  if (recent.answered < 20) return returning ? 3 : 1;
  const rate = recent.right / recent.answered;
  if (rate >= 0.85) return 3;
  if (rate >= 0.75) return 2;
  return 1;
}

/** How each type is answered once past multiple choice; area codes are recalled on the map. */
const RECALL_MODES: Partial<Record<CardType, SessionMode>> = {
  flag: 'recall',
  region: 'recall',
  script: 'recall',
  areacode: 'map',
};

export function modeFor(card: Card, state: CardState | undefined): SessionMode {
  // a regions-map card has no options: it is always answered by clicking the map
  if (card.map) return 'map';
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

/** What a card is about for spacing: its clue family, else its type. */
const topicOf = (card: Card): string => card.subject ?? card.type;

/**
 * Reorders so no type runs longer than MAX_RUN and no two cards of one clue are back to back,
 * staying as close to the input order as possible. Picks are checked against the remaining counts
 * so a dominant type is not stranded at the end; keeping siblings apart comes first. Where it can,
 * the next card also differs from the last in family (bollard, pole…) and country.
 */
export function interleave(cards: Card[]): Card[] {
  const rest = [...cards];
  const out: Card[] = [];
  let runType: CardType | undefined;
  let runLength = 0;
  let lastClue: string | undefined;
  let last: Card | undefined;

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
    const apart = (card: Card) => lastClue === undefined || clueOf(card) !== lastClue;
    const newTopic = (card: Card) => !last || topicOf(card) !== topicOf(last);
    const newCountry = (card: Card) => !last || card.country !== last.country;
    const good = (card: Card) => apart(card) && fits(card) && feasibleAfter(card.type);
    const topics = new Map<string, number>();
    for (const card of rest) topics.set(topicOf(card), (topics.get(topicOf(card)) ?? 0) + 1);
    /** after this card, every family can still be kept apart from its own kind */
    const topicRoom = (card: Card) =>
      [...topics].every(([topic, count]) => {
        const left = topic === topicOf(card) ? count - 1 : count;
        const others = rest.length - 1 - left;
        return left <= others + (topic === topicOf(card) ? 0 : 1);
      });

    const index = [
      rest.findIndex((card) => good(card) && newTopic(card) && topicRoom(card) && newCountry(card)),
      rest.findIndex((card) => good(card) && newTopic(card) && topicRoom(card)),
      rest.findIndex((card) => good(card) && newTopic(card)),
      rest.findIndex(good),
      rest.findIndex((card) => apart(card) && fits(card) && newTopic(card) && topicRoom(card)),
      rest.findIndex((card) => apart(card) && fits(card) && newTopic(card)),
      rest.findIndex((card) => apart(card) && newTopic(card) && topicRoom(card)),
      rest.findIndex((card) => apart(card) && fits(card)),
      rest.findIndex((card) => apart(card) && newTopic(card)),
      rest.findIndex(apart),
      0,
    ].find((i) => i >= 0) as number;
    const [card] = rest.splice(index, 1) as [Card];
    runLength = nextRun(card.type);
    runType = card.type;
    lastClue = clueOf(card);
    last = card;
    out.push(card);
  }
  return out;
}

function contrastItems(confusion: Confusion, cards: Card[], rng: Rng): SessionItem[] {
  // map-scoped pairs ("ca:NL") are states, drilled on their map: never a flag or country round
  if (isMapKey(confusion.picked) || isMapKey(confusion.truth)) return [];
  const isSide = (card: Card, side: string) => card.answer === side || card.country === side;
  // regions-map cards are drilled on their map, not as a binary pick between two state codes
  const sides = cards
    .filter((card) => !card.map)
    .filter((card) => isSide(card, confusion.truth))
    .map((truth) => [
      truth,
      cards.find((card) => card.type === truth.type && isSide(card, confusion.picked)),
    ])
    .find((pair): pair is [Card, Card] => pair[1] !== undefined);
  if (!sides) return [];

  if (confusion.contrastStreak >= CONTRAST_STREAK_TO_RESOLVE) return [];
  // one question per pair a day, on a random side: the pair resolves over several days, never
  // as a block of the same two cards back to back
  return [
    {
      cardId: (sides[rng() < 0.5 ? 0 : 1] as Card).id,
      mode: 'binary' as const,
      contrastPair: [confusion.picked, confusion.truth],
    },
  ];
}

/**
 * Puts each contrast question at an evenly spread place in the queue (never first, never two
 * together), so a pair is asked once among the other cards.
 */
function spreadIn(queue: SessionItem[], extra: SessionItem[]): SessionItem[] {
  if (extra.length === 0) return queue;
  const out = [...queue];
  const step = (queue.length + 1) / (extra.length + 1);
  extra.forEach((item, i) => {
    const at = Math.min(out.length, Math.max(1, Math.round(step * (i + 1))) + i);
    out.splice(at, 0, item);
  });
  return out;
}

/**
 * Today's queue: due reviews (oldest first, capped) mixed with new
 * cards in curriculum order (block targets first, see curriculum.ts), topped up with weak
 * block-target cards to about 40%, interleaved by type, with one question for each confused pair
 * (at most MAX_CONTRAST) spread through it. Without `rng`, the shuffles are seeded by the day, so
 * reloading shows the same queue. Missed cards come back at the end (see requeueMissed).
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
  /** ids of the cards first answered today, for the curriculum's per-clue daily limit */
  introducedToday?: string[];
  /** multiplier on settings.newPerDay (see intakeFor) */
  intake?: number;
  /** estimated seconds per new card (see newCardSeconds) */
  newSeconds?: number;
}): Session {
  const { cards, states, confusions, block, now } = input;
  const done = input.doneToday ?? { reviews: 0, newCards: 0 };
  const settings = {
    ...input.settings,
    maxReviewsPerDay: Math.max(0, input.settings.maxReviewsPerDay - done.reviews),
    newPerDay: Math.max(0, input.settings.newPerDay - done.newCards),
  };
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const rng = input.rng ?? mulberry32(startOfToday);
  const isTarget = (card: Card) => block?.targets.some((t) => matchesTarget(card, t)) ?? false;
  const stateOf = (card: Card) => states[card.id];
  const isSeen = (card: Card) => (stateOf(card)?.state ?? 'new') !== 'new';

  // due reviews, the most valuable at the most risk first: when the session's time cannot hold
  // them all, the ones left out are those that matter least in a round or are still well known
  const recallOf = new Map<string, number>();
  const due = cards
    .filter((card) => isSeen(card) && Date.parse(stateOf(card)?.due ?? '') <= now.getTime())
    .map((card) => {
      const recall = retrievability(stateOf(card) as CardState, now);
      recallOf.set(card.id, recall);
      return { card, priority: cardValue(card) * (1.05 - recall) };
    })
    .sort((a, b) => b.priority - a.priority)
    .map(({ card }) => card);
  const cap = settings.maxReviewsPerDay;
  const overdue = due.filter((card) => Date.parse(stateOf(card)?.due ?? '') < startOfToday);
  const catchUp = overdue.length > CATCH_UP_FACTOR * cap;

  // the time box: what is already done today counts against it
  const budget =
    (input.settings.sessionMinutes ?? DEFAULT_SESSION_MINUTES) * 60 -
    done.reviews * REVIEW_SECONDS -
    done.newCards * NEW_SECONDS;
  const newWanted = Math.round(settings.newPerDay * (input.intake ?? 1));
  const newCost = Math.min(NEW_SECONDS, input.newSeconds ?? NEW_SECONDS);
  const reserve = Math.min(MIN_NEW, newWanted) * newCost;
  const reviews: Card[] = [];
  let spent = 0;
  for (const card of due.slice(0, cap)) {
    const cost = reviewSeconds(recallOf.get(card.id) ?? 0.9);
    if (spent + cost > budget - reserve && reviews.length > 0) break;
    reviews.push(card);
    spent += cost;
  }
  const newRoom = Math.max(Math.min(MIN_NEW, newWanted), Math.floor((budget - spent) / newCost));
  const fresh = newCards({
    cards,
    states,
    count: Math.max(0, Math.min(newWanted, newRoom)),
    introducedToday: input.introducedToday,
    focus: settings.focusCountries,
    isTarget,
  });

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

  const contrast = activePairs(confusions, now)
    .flatMap((c) => contrastItems(c, cards, rng))
    .slice(0, MAX_CONTRAST);
  const contrastIds = new Set(contrast.map((item) => item.cardId));
  const notContrast = (card: Card) => !contrastIds.has(card.id);
  const ordered = interleave(
    mix(shuffle([...reviews, ...blockExtras].filter(notContrast), rng), fresh.filter(notContrast)),
  );
  return {
    queue: spreadIn(
      ordered.map((card) => {
        // a review shows the clue's photos in turn, so it is the clue that is recalled
        const imageId = isSeen(card) ? photoTurn(card, cards, stateOf(card)?.reps ?? 0) : undefined;
        return { cardId: card.id, mode: modeFor(card, stateOf(card)), ...(imageId && { imageId }) };
      }),
      contrast,
    ),
    catchUp,
    remaining: due.length - reviews.length,
  };
}

/** New cards in curriculum order, block targets first. */
function newCards(input: {
  cards: Card[];
  states: Record<string, CardState>;
  count: number;
  introducedToday?: string[];
  focus?: string[];
  isTarget(card: Card): boolean;
}): Card[] {
  const { cards, isTarget, ...rest } = input;
  const targets = pickNewCards({ ...rest, cards: cards.filter(isTarget) });
  const others = pickNewCards({
    ...rest,
    cards: cards.filter((card) => !isTarget(card)),
    count: input.count - targets.length,
    introducedToday: [...(input.introducedToday ?? []), ...targets.map((card) => card.id)],
  });
  return [...targets, ...others];
}

/**
 * Another photo of a Spot it card's clue to show instead of its own, so a card that comes back
 * (a review, a retry after a miss) is recognised by the clue and not by the picture: the clue's
 * images taken in turn by `turn` (the card's review count, or the retry). Undefined when the
 * turn lands on the card's own image or the clue has one photo.
 */
const photoIndex = new WeakMap<Card[], Map<string, string[]>>();
/** Each clue's Spot it photo ids, built once per card list. */
function cluePhotos(cards: Card[]): Map<string, string[]> {
  let index = photoIndex.get(cards);
  if (!index) {
    index = new Map();
    for (const c of cards) {
      const id = c.clue?.id;
      const image = c.clue?.image?.id;
      if (c.type !== 'spot' || !id || !image) continue;
      index.set(id, [...(index.get(id) ?? []), image]);
    }
    photoIndex.set(cards, index);
  }
  return index;
}

export function photoTurn(card: Card, cards: Card[], turn: number): string | undefined {
  const clueId = card.clue?.id;
  if (card.type !== 'spot' || !clueId) return undefined;
  const images = cluePhotos(cards).get(clueId) ?? [];
  if (images.length < 2) return undefined;
  const pick = images[turn % images.length];
  return pick === card.clue?.image?.id ? undefined : pick;
}

/**
 * A session card answered wrong goes to the end of the queue, again and again until it is answered
 * right, so the session only ends once every card has been got right.
 */
export function requeueMissed(
  queue: SessionItem[],
  item: SessionItem,
  cards?: Card[],
): SessionItem[] {
  // a Spot it card comes back with the clue's other photo when it has one
  const card = cards?.find((c) => c.id === item.cardId);
  const shown = item.imageId ?? card?.clue?.image?.id;
  const other =
    card && cards
      ? [photoTurn(card, cards, 0), photoTurn(card, cards, 1)].find((id) => id && id !== shown)
      : undefined;
  const retry: SessionItem = { cardId: item.cardId, mode: item.mode, retry: true };
  if (item.contrastPair) retry.contrastPair = item.contrastPair;
  if (other) retry.imageId = other;
  return [...queue, retry];
}

const asItems = (cards: Card[], states: Record<string, CardState>): SessionItem[] =>
  interleave(cards).map((card) => ({ cardId: card.id, mode: modeFor(card, states[card.id]) }));

/** New cards past the daily limit learned on request ("Learn 15 more"), like Anki's custom study. */
export const LEARN_MORE = 15;
/** Cards in a review-ahead session ("Practise more"). */
export const PRACTISE_MORE = 20;

/**
 * "Learn more": `count` new cards beyond today's limit, in curriculum order, without touching the
 * settings. The per-clue daily limit still holds.
 */
export function learnMoreSession(input: {
  cards: Card[];
  states: Record<string, CardState>;
  settings: Pick<Settings, 'focusCountries'>;
  introducedToday?: string[];
  count?: number;
}): Session {
  const fresh = pickNewCards({
    cards: input.cards,
    states: input.states,
    count: input.count ?? LEARN_MORE,
    introducedToday: input.introducedToday,
    focus: input.settings.focusCountries,
  });
  return { queue: asItems(fresh, input.states), catchUp: false, remaining: 0 };
}

/**
 * "Practise more": a review-ahead session of the `count` seen cards with the lowest
 * retrievability, for when nothing is due.
 */
export function practiseMoreSession(input: {
  cards: Card[];
  states: Record<string, CardState>;
  now: Date;
  count?: number;
}): Session {
  const { states, now } = input;
  const weakest = input.cards
    .filter((card) => (states[card.id]?.state ?? 'new') !== 'new')
    .map((card) => ({ card, r: retrievability(states[card.id] as CardState, now) }))
    .sort((a, b) => a.r - b.r || a.card.id.localeCompare(b.card.id))
    .slice(0, input.count ?? PRACTISE_MORE)
    .map(({ card }) => card);
  return { queue: asItems(weakest, states), catchUp: false, remaining: 0 };
}
