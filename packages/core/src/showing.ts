// What one showing of a clue card offers. A card's baked `options` are only its first showing:
// each time it comes back the distractors are drawn again from its wider pool and the answer goes
// to a random place, so the learner learns the clue, not where the right button was. Seeded, so
// one showing is stable across re-renders.
import { seededRng, shuffle, type Rng } from './random';
import type { Card } from './types';

const CHOICES = 4;

/** The seed of one showing: the card, how often it has been reviewed, and when it is shown. */
export const showingSeed = (cardId: string, reps = 0, shownAt: number | string = 0): string =>
  `${cardId}:${reps}:${shownAt}`;

/**
 * Three distractors from a ranked pool: one of the close ones (lookalikes, "differs"), sometimes
 * two, the rest from the remaining pool, each showing a different draw.
 */
function drawDistractors<T>(pool: readonly T[], close: number, rng: Rng, first: T[] = []): T[] {
  // what the learner has picked for this answer before comes back first, one of it per showing
  const own = first.filter((f) => pool.includes(f)).slice(0, 1);
  const left = pool.filter((p) => !own.includes(p));
  const closeLeft = left.filter((p) => pool.indexOf(p) < close);
  const near = shuffle(closeLeft, rng);
  const nearWanted = near.length === 0 ? 0 : near.length >= 2 && rng() < 0.5 ? 2 : 1;
  const takeNear = Math.max(0, nearWanted - own.length);
  const picks = [...own, ...near.slice(0, takeNear)];
  const rest = shuffle(
    [...near.slice(takeNear), ...left.filter((p) => !closeLeft.includes(p))],
    rng,
  );
  return [...picks, ...rest].slice(0, CHOICES - 1);
}

/** `items` with `answer` put at a uniformly random position. */
function placeAnswer<T>(answer: T, distractors: T[], rng: Rng): T[] {
  const order = shuffle(distractors, rng);
  const at = Math.floor(rng() * (order.length + 1));
  return [...order.slice(0, at), answer, ...order.slice(at)];
}

/**
 * The card as this showing presents it: for clue cards with a distractor pool, options redrawn
 * by `seed` (a Which clue card's images too). `mixedUp` lists answers the learner picked for this
 * card's answer before, most often first: one of them is always among the options. Other cards
 * come back unchanged.
 */
export function cardForShowing(card: Card, seed: string, mixedUp: string[] = []): Card {
  const clue = card.clue;
  if (!clue) return card;
  const rng = seededRng(seed);
  if (card.type === 'which' && clue.alternates && clue.image && clue.choices) {
    if (clue.alternates.length < CHOICES - 1) return card;
    const own = clue.choices.find((c) => c.image.id === card.answer);
    if (!own) return card;
    const choices = placeAnswer(own, drawDistractors(clue.alternates, clue.close ?? 0, rng), rng);
    return { ...card, options: choices.map((c) => c.image.id), clue: { ...clue, choices } };
  }
  const pool = clue.distractors;
  if (!pool || pool.length < CHOICES - 1) return card;
  const distractors = drawDistractors(pool, clue.close ?? 0, rng, mixedUp);
  return { ...card, options: placeAnswer(card.answer, distractors, rng) };
}
