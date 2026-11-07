import { shuffle, type Rng } from './random';
import { knownCardState } from './scheduler';
import type { Card, CardState } from './types';

/** Up to `max` of a country's cards, dealt round-robin across types so the test is mixed. */
export function buildPlacement(cards: Card[], country: string, rng: Rng, max = 12): Card[] {
  const byType = new Map<string, Card[]>();
  const pool = shuffle(
    cards.filter((c) => c.country === country),
    rng,
  );
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
