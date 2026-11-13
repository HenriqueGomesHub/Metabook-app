import { shuffle, type Rng } from './random';
import { knownCardState } from './scheduler';
import { isCountryLevel } from './session';
import type { Card, CardState } from './types';

/** Share of a placement test drawn from other countries, so "always tap X" cannot pass it. */
export const PLACEMENT_DECOYS = 0.4;

/**
 * Up to `max` cards for a country's placement test, dealt round-robin across types so the test is
 * mixed. With `near` countries given, about 40% are those countries' cards of the same
 * country-level types (flags, clues), shuffled in: a test whose every answer is the country
 * measures nothing. Only the country's own cards count towards placement (see applyPlacement).
 */
export function buildPlacement(
  cards: Card[],
  country: string,
  rng: Rng,
  max = 12,
  near: string[] = [],
): Card[] {
  const own = deal(
    cards.filter((c) => c.country === country),
    rng,
    max,
  );
  const types = new Set(own.filter(isCountryLevel).map((c) => c.type));
  const nearby = new Set(near.filter((code) => code !== country));
  const decoys =
    types.size === 0 || nearby.size === 0
      ? []
      : deal(
          cards.filter((c) => nearby.has(c.country) && types.has(c.type) && isCountryLevel(c)),
          rng,
          Math.round(max * PLACEMENT_DECOYS),
        );
  if (decoys.length === 0) return own;
  return shuffle([...own.slice(0, max - decoys.length), ...decoys], rng);
}

/** Up to `max` of the cards, dealt round-robin across types. */
function deal(cards: Card[], rng: Rng, max: number): Card[] {
  const byType = new Map<string, Card[]>();
  const pool = shuffle(cards, rng);
  for (const card of pool) {
    byType.set(card.type, [...(byType.get(card.type) ?? []), card]);
  }
  const piles = shuffle([...byType.keys()].sort(), rng).map((type) => byType.get(type) ?? []);
  const out: Card[] = [];
  for (let round = 0; out.length < max && piles.some((p) => p.length > round); round++) {
    for (const pile of piles) {
      const card = pile[round];
      if (card && out.length < max) out.push(card);
    }
  }
  return out;
}

/** Correct answers seed the card as already known; wrong ones leave it new. */
export function applyPlacement(
  results: { cardId: string; correct: boolean }[],
  now: Date,
  desiredRetention: number,
): CardState[] {
  return results
    .filter((r) => r.correct)
    .map((r) => knownCardState(r.cardId, now, desiredRetention));
}
