import { describe, expect, it } from 'vitest';
import { CLUE_COUNTRIES, CLUE_NAMES, CLUE_POOL } from './__fixtures__/clues';
import { clueCards } from './clueCards';
import { clueCardIds } from './clues';
import { cardForShowing, showingSeed } from './showing';
import type { Card } from './types';

const base: Card = {
  id: 'clue:fr-b:spot:1',
  type: 'spot',
  country: 'FR',
  answer: 'France',
  options: ['France', 'Spain', 'Italy', 'Belgium'],
  prompt: { kind: 'image', value: 'x' },
  tags: [],
  source: 'x',
  clue: {
    id: 'fr-b',
    distractors: ['Belgium', 'Spain', 'Italy', 'Portugal', 'Germany', 'Switzerland', 'Austria'],
    close: 1,
  },
};

describe('cardForShowing', () => {
  it('is the same for the same showing (re-render safe)', () => {
    const seed = showingSeed(base.id, 3, 1700000000000);
    expect(cardForShowing(base, seed)).toEqual(cardForShowing(base, seed));
  });

  it('always offers four distinct options with the answer once', () => {
    for (let reps = 0; reps < 50; reps++) {
      const { options } = cardForShowing(base, showingSeed(base.id, reps));
      expect(options).toHaveLength(4);
      expect(new Set(options).size).toBe(4);
      expect(options!.filter((o) => o === 'France')).toHaveLength(1);
      // a close lookalike is always among them
      expect(options).toContain('Belgium');
    }
  });

  it('varies the distractors and their order between showings', () => {
    const sets = new Set<string>();
    const orders = new Set<string>();
    for (let reps = 0; reps < 30; reps++) {
      const { options } = cardForShowing(base, showingSeed(base.id, reps));
      sets.add([...options!].sort().join());
      orders.add(options!.join());
    }
    expect(sets.size).toBeGreaterThan(5);
    expect(orders.size).toBeGreaterThan(20);
  });

  it('puts the answer at each position about equally often', () => {
    const counts = [0, 0, 0, 0];
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const { options } = cardForShowing(base, showingSeed(base.id, i, i * 7919));
      counts[options!.indexOf('France')]! += 1;
    }
    for (const count of counts) expect(Math.abs(count / n - 0.25)).toBeLessThan(0.03);
  });

  it('redraws Which clue images, the answer image always among them', () => {
    const cards = clueCards({ clues: CLUE_COUNTRIES, pool: CLUE_POOL, names: CLUE_NAMES });
    const which = cards.find((c) => c.id === clueCardIds.which('PL-vySo'))!;
    const positions = new Set<number>();
    for (let reps = 0; reps < 40; reps++) {
      const shown = cardForShowing(which, showingSeed(which.id, reps));
      expect(shown.options).toHaveLength(4);
      expect(shown.options).toContain(which.answer);
      expect(shown.clue?.choices?.map((c) => c.image.id)).toEqual(shown.options);
      positions.add(shown.options!.indexOf(which.answer));
    }
    expect(positions.size).toBe(4);
  });

  it('leaves cards without a pool alone', () => {
    const flag: Card = { ...base, id: 'flag:FR', type: 'flag', clue: undefined };
    expect(cardForShowing(flag, 'x')).toBe(flag);
  });
});
