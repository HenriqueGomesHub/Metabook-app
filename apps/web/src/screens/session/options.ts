import { shuffle, subregionOf } from '@metabook/core';
import type { Card, Rng, SessionItem } from '@metabook/core';

const CHOICES: Partial<Record<Card['type'], number>> = { region: 5 };
const DEFAULT_CHOICES = 4;

/** A contrast side is an answer or a country code; show it as the answer of a same-type card. */
function sideLabel(key: string, type: Card['type'], cards: Card[]): string {
  return (
    cards.find((c) => c.type === type && (c.answer === key || c.country === key))?.answer ?? key
  );
}

/**
 * Flags people mix up: the drill is to tell these apart, so they are each other's distractors
 * before any other flag.
 */
const FLAG_SETS = [
  ['TD', 'RO', 'AD', 'MD'],
  ['ID', 'MC', 'PL', 'SG'],
  ['IE', 'CI', 'IT', 'MX'],
  ['NL', 'LU', 'FR', 'HR', 'RU', 'PY'],
  ['AU', 'NZ', 'GB'],
  ['NO', 'IS', 'DK', 'SE', 'FI', 'FO', 'AX'],
  ['SN', 'ML', 'GN', 'CM', 'GH'],
  ['SI', 'SK', 'RU', 'RS', 'HR'],
  ['VE', 'CO', 'EC'],
  ['JO', 'PS', 'SD', 'AE', 'KW'],
  ['SV', 'HN', 'NI', 'GT', 'AR'],
  ['LI', 'HT'],
  ['LT', 'BO', 'GH', 'ET'],
  ['US', 'LR', 'MY', 'PR', 'CU'],
  ['AT', 'LV', 'LB'],
  ['BE', 'DE'],
  ['QA', 'BH'],
  ['TH', 'CR'],
  ['NG', 'NF'],
];

const flagMates = (code: string) => new Set(FLAG_SETS.filter((set) => set.includes(code)).flat());

/**
 * Other answers of the same type in the order they make plausible distractors: the same country
 * (its other regions), flags people mix up, the same subregion, then the rest.
 */
function distractors(card: Card, cards: Card[], rng: Rng): string[] {
  const mates = card.type === 'flag' ? flagMates(card.country) : new Set<string>();
  const region = subregionOf(card.country);
  const rank = (c: Card) =>
    c.country === card.country && card.type !== 'flag'
      ? 0
      : mates.has(c.country)
        ? 1
        : region && subregionOf(c.country) === region
          ? 2
          : 3;
  const pool = shuffle(
    // other regions a clue is also seen in are right too, never distractors
    cards.filter(
      (c) => c.type === card.type && c.answer !== card.answer && !card.spans?.includes(c.answer),
    ),
    rng,
  ).sort((a, b) => rank(a) - rank(b));
  return [...new Set(pool.map((c) => c.answer))];
}

/**
 * Choices for an item in display order, always shuffled: authored options and contrast pairs list
 * the answer first, and an unshuffled answer is learnt by its position. Empty for recall.
 */
export function optionsFor(item: SessionItem, card: Card, cards: Card[], rng: Rng): string[] {
  if (item.mode === 'recall') return [];
  if (item.mode === 'binary') {
    if (item.contrastPair) {
      return shuffle(
        item.contrastPair.map((key) => sideLabel(key, card.type, cards)),
        rng,
      );
    }
    if (card.options && card.options.length >= 2) return shuffle(card.options.slice(0, 2), rng);
    return shuffle([card.answer, ...distractors(card, cards, rng).slice(0, 1)], rng);
  }
  if (card.options) return shuffle(card.options, rng);
  const count = CHOICES[card.type] ?? DEFAULT_CHOICES;
  return shuffle([card.answer, ...distractors(card, cards, rng).slice(0, count - 1)], rng);
}
