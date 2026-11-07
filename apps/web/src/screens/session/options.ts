import { shuffle } from '@metabook/core';
import type { Card, Rng, SessionItem } from '@metabook/core';

const CHOICES: Partial<Record<Card['type'], number>> = { region: 5 };
const DEFAULT_CHOICES = 4;

/** A contrast side is an answer or a country code; show it as the answer of a same-type card. */
function sideLabel(key: string, type: Card['type'], cards: Card[]): string {
  return (
    cards.find((c) => c.type === type && (c.answer === key || c.country === key))?.answer ?? key
  );
}

/** Other answers of the same type, same country first so distractors stay plausible. */
function distractors(card: Card, cards: Card[], rng: Rng): string[] {
  const pool = shuffle(
    cards.filter((c) => c.type === card.type && c.answer !== card.answer),
    rng,
  ).sort((a, b) => Number(b.country === card.country) - Number(a.country === card.country));
  return [...new Set(pool.map((c) => c.answer))];
}

/** Choices for an item in display order (authored options keep their order); empty for recall. */
export function optionsFor(item: SessionItem, card: Card, cards: Card[], rng: Rng): string[] {
  if (item.mode === 'recall') return [];
  if (item.mode === 'binary') {
    if (item.contrastPair) return item.contrastPair.map((key) => sideLabel(key, card.type, cards));
    if (card.options && card.options.length >= 2) return card.options.slice(0, 2);
    return shuffle([card.answer, ...distractors(card, cards, rng).slice(0, 1)], rng);
  }
  if (card.options) return card.options;
  const count = CHOICES[card.type] ?? DEFAULT_CHOICES;
  return shuffle([card.answer, ...distractors(card, cards, rng).slice(0, count - 1)], rng);
}
