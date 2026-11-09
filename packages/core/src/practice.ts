import { activePairs, isMapKey } from './confusions';
import type { Rng } from './random';
import { retrievability } from './scheduler';
import { modeFor, type SessionItem } from './session';
import type { Card, CardState, Confusion } from './types';

const WEAKNESS_FLOOR = 0.15;
const CONFUSION_BOOST = 2;
/** Unseen cards get a boost but never take more than this share of the draw. */
const UNSEEN_BOOST = 3;
const UNSEEN_SHARE = 0.3;
const RECENT_WINDOW = 3;
/** The no-repeat rule only applies to pools larger than this, so small pools can still be drilled. */
const RECENT_MIN_POOL = 4;
const RELEARN_GAP_MIN = 2;
const RELEARN_GAP_MAX = 4;
const RELEARN_STREAK = 2;

interface Relearn {
  cardId: string;
  /** other items that must still be served before the card comes back */
  wait: number;
  /** consecutive right answers in this practice */
  streak: number;
}

export interface PracticeState {
  cards: Card[];
  /** ids of cards in an active confusion pair */
  confused: string[];
  relearn: Relearn[];
  /** most recent first */
  recent: string[];
  rng: Rng;
}

export function createPractice(input: {
  cards: Card[];
  states: Record<string, CardState>;
  confusions: Confusion[];
  now: Date;
  rng: Rng;
}): PracticeState {
  const { cards, confusions, now, rng } = input;
  // map-scoped keys ("ca:NL") are states, not the countries or answers cards are matched on
  const sides = new Set(
    activePairs(confusions, now)
      .flatMap((c) => [c.picked, c.truth])
      .filter((key) => !isMapKey(key)),
  );
  const confused = cards
    .filter((card) => sides.has(card.answer) || sides.has(card.country))
    .map((card) => card.id);
  return { cards, confused, relearn: [], recent: [], rng };
}

function weight(practice: PracticeState, card: Card, states: Record<string, CardState>, now: Date) {
  const state = states[card.id];
  const recall = state ? retrievability(state, now) : 0;
  const base = 1 - recall + WEAKNESS_FLOOR;
  return practice.confused.includes(card.id) ? base * CONFUSION_BOOST : base;
}

function isUnseen(card: Card, states: Record<string, CardState>): boolean {
  return (states[card.id]?.state ?? 'new') === 'new';
}

function sample(cards: Card[], weights: number[], rng: Rng): Card {
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = rng() * total;
  const index = weights.findIndex((w) => (pick -= w) < 0);
  return cards[index < 0 ? cards.length - 1 : index] as Card;
}

/** Weighted draw by weakness, with the unseen cards as a group limited to UNSEEN_SHARE. */
function drawWeighted(
  practice: PracticeState,
  candidates: Card[],
  states: Record<string, CardState>,
  now: Date,
): Card {
  const weights = candidates.map((card) => {
    const w = weight(practice, card, states, now);
    return isUnseen(card, states) ? w * UNSEEN_BOOST : w;
  });
  const unseenTotal = candidates.reduce(
    (sum, card, i) => sum + (isUnseen(card, states) ? (weights[i] as number) : 0),
    0,
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const seenTotal = total - unseenTotal;
  if (unseenTotal === 0 || seenTotal === 0) return sample(candidates, weights, practice.rng);
  // Scale the unseen group so its share of the total is at most UNSEEN_SHARE.
  const scale = Math.min(1, (UNSEEN_SHARE * seenTotal) / ((1 - UNSEEN_SHARE) * unseenTotal));
  const scaled = weights.map((w, i) => (isUnseen(candidates[i] as Card, states) ? w * scale : w));
  return sample(candidates, scaled, practice.rng);
}

function choose(
  practice: PracticeState,
  states: Record<string, CardState>,
  now: Date,
): { card: Card; relearn: Relearn[] } {
  const byId = new Map(practice.cards.map((card) => [card.id, card]));
  const ready = practice.relearn.find((r) => r.wait <= 0 && byId.has(r.cardId));
  // Every other queued card counts this item toward its wait.
  const tick = (served: string) =>
    practice.relearn.map((r) => (r.cardId === served ? r : { ...r, wait: r.wait - 1 }));
  if (ready) return { card: byId.get(ready.cardId) as Card, relearn: tick(ready.cardId) };

  const blocked = new Set(
    practice.cards.length > RECENT_MIN_POOL ? practice.recent.slice(0, RECENT_WINDOW) : [],
  );
  // Queued cards are served by the relearn rule, not by the weighted draw.
  const queued = new Set(practice.relearn.map((r) => r.cardId));
  let candidates = practice.cards.filter((c) => !blocked.has(c.id) && !queued.has(c.id));
  if (candidates.length === 0) candidates = practice.cards.filter((c) => !blocked.has(c.id));
  if (candidates.length === 0) candidates = practice.cards;
  const card = drawWeighted(practice, candidates, states, now);
  return { card, relearn: tick(card.id) };
}

/** The next card to drill. Never runs out for a non-empty pool. */
export function nextPracticeItem(
  practice: PracticeState,
  states: Record<string, CardState>,
  now: Date,
): { item: SessionItem; practice: PracticeState } {
  if (practice.cards.length === 0) throw new Error('practice pool is empty');
  const { card, relearn } = choose(practice, states, now);
  return {
    item: { cardId: card.id, mode: modeFor(card, states[card.id]) },
    practice: {
      ...practice,
      relearn,
      recent: [card.id, ...practice.recent].slice(0, RECENT_WINDOW),
    },
  };
}

/** A wrong answer queues the card to return after 2-4 other items; two rights in a row release it. */
export function recordPracticeAnswer(
  practice: PracticeState,
  cardId: string,
  correct: boolean,
): PracticeState {
  const existing = practice.relearn.find((r) => r.cardId === cardId);
  const others = practice.relearn.filter((r) => r.cardId !== cardId);
  if (!correct) {
    const span = RELEARN_GAP_MAX - RELEARN_GAP_MIN + 1;
    const wait = RELEARN_GAP_MIN + Math.floor(practice.rng() * span);
    return { ...practice, relearn: [...others, { cardId, wait, streak: 0 }] };
  }
  if (!existing) return practice;
  const streak = existing.streak + 1;
  if (streak >= RELEARN_STREAK) return { ...practice, relearn: others };
  // One right so far: bring it back again after another short gap.
  const wait =
    RELEARN_GAP_MIN + Math.floor(practice.rng() * (RELEARN_GAP_MAX - RELEARN_GAP_MIN + 1));
  return { ...practice, relearn: [...others, { cardId, wait, streak }] };
}
