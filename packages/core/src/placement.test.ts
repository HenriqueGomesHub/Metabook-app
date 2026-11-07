import { describe, expect, it } from 'vitest';
import { applyPlacement, buildPlacement } from './placement';
import { mulberry32 } from './random';
import type { Card, CardType } from './types';

const card = (id: string, type: CardType, country = 'BR'): Card => ({
  id,
  type,
  country,
  answer: id,
  prompt: { kind: 'text', value: id },
  tags: [],
  source: 'https://example.org',
});

const cards = [
  ...Array.from({ length: 20 }, (_, i) => card(`ddd${i}`, 'areacode')),
  ...Array.from({ length: 4 }, (_, i) => card(`region${i}`, 'region')),
  card('flag:br', 'flag'),
  card('flag:ar', 'flag', 'AR'),
];

describe('buildPlacement', () => {
  it('picks up to 12 cards of the country, mixed across types', () => {
    const test = buildPlacement(cards, 'BR', mulberry32(1));
    expect(test).toHaveLength(12);
    expect(test.every((c) => c.country === 'BR')).toBe(true);
    const types = test.map((c) => c.type);
    expect(types.filter((t) => t === 'flag')).toHaveLength(1);
    expect(types.filter((t) => t === 'region')).toHaveLength(4);
    expect(new Set(types.slice(0, 3))).toEqual(new Set(['areacode', 'region', 'flag']));
  });

  it('respects a smaller max and small decks', () => {
    expect(buildPlacement(cards, 'BR', mulberry32(1), 5)).toHaveLength(5);
    expect(buildPlacement(cards, 'AR', mulberry32(1))).toEqual([cards.at(-1)]);
  });

  it('is deterministic for a seed', () => {
    expect(buildPlacement(cards, 'BR', mulberry32(9))).toEqual(
      buildPlacement(cards, 'BR', mulberry32(9)),
    );
  });
});

describe('applyPlacement', () => {
  it('seeds correct answers as known review cards and leaves wrong ones alone', () => {
    const now = new Date('2026-03-01T12:00:00Z');
    const states = applyPlacement(
      [
        { cardId: 'a', correct: true },
        { cardId: 'b', correct: false },
      ],
      now,
      0.9,
    );
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      cardId: 'a',
      state: 'review',
      reps: 1,
      lastReview: now.toISOString(),
    });
  });
});
