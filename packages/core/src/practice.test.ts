import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import {
  createPractice,
  nextPracticeItem,
  recordPracticeAnswer,
  type PracticeState,
} from './practice';
import { applyReview, newCardState } from './scheduler';
import type { Card, CardState, CardType, Confusion } from './types';

const now = new Date('2026-03-15T12:00:00Z');
const card = (id: string, type: CardType = 'flag', country = 'BR', answer = id): Card => ({
  id,
  type,
  country,
  answer,
  prompt: { kind: 'text', value: id },
  tags: [],
  source: 'https://example.org',
});
const pool = (n: number) => Array.from({ length: n }, (_, i) => card(`c${i}`, 'flag', `C${i}`));
const start = (
  cards: Card[],
  states: Record<string, CardState> = {},
  seed = 1,
  confusions: Confusion[] = [],
) => createPractice({ cards, states, confusions, now, rng: mulberry32(seed) });

/** Runs `steps` answers with `answer(cardId, step)` deciding right or wrong. */
function run(
  initial: PracticeState,
  states: Record<string, CardState>,
  steps: number,
  answer: (cardId: string, step: number) => boolean = () => true,
) {
  let practice = initial;
  const ids: string[] = [];
  for (let i = 0; i < steps; i++) {
    const next = nextPracticeItem(practice, states, now);
    ids.push(next.item.cardId);
    practice = recordPracticeAnswer(next.practice, next.item.cardId, answer(next.item.cardId, i));
  }
  return ids;
}

const strong = (id: string): CardState => ({
  ...applyReview(newCardState(id, now), 'good', new Date(now.getTime() - 86_400_000), 0.9),
  stability: 200,
});
const weak = (id: string): CardState => ({ ...strong(id), stability: 0.05 });

describe('practice', () => {
  it('never runs out of items, even for one card', () => {
    for (const n of [1, 2, 5, 30]) {
      const ids = run(start(pool(n)), {}, 500);
      expect(ids).toHaveLength(500);
      expect(ids.every((id) => id.startsWith('c'))).toBe(true);
    }
  });

  it('is deterministic for a seed', () => {
    const a = run(start(pool(10), {}, 7), {}, 60, (_, i) => i % 3 !== 0);
    const b = run(start(pool(10), {}, 7), {}, 60, (_, i) => i % 3 !== 0);
    expect(a).toEqual(b);
  });

  it('does not repeat any of the last 3 cards when the pool has more than 4', () => {
    const ids = run(start(pool(6)), {}, 300);
    ids.forEach((id, i) => expect(ids.slice(Math.max(0, i - 3), i)).not.toContain(id));
  });

  it('never serves the same card twice in a row in a small pool, unless it is the only one', () => {
    for (const n of [2, 3, 4]) {
      for (const seed of [1, 2, 3]) {
        const ids = run(start(pool(n), {}, seed), {}, 200, (_, i) => i % 4 !== 0);
        ids.slice(1).forEach((id, i) => expect(id).not.toBe(ids[i]));
      }
    }
    expect(new Set(run(start(pool(1)), {}, 5))).toEqual(new Set(['c0']));
  });

  it('brings a wrong card back within 5 steps and stops forcing it after two rights', () => {
    const cards = pool(20);
    let target = '';
    let practice = start(cards, {}, 3);
    const seen: string[] = [];
    let wrongAt = -1;
    let rights = 0;
    for (let i = 0; i < 80; i++) {
      const next = nextPracticeItem(practice, {}, now);
      const id = next.item.cardId;
      if (!target) target = id;
      seen.push(id);
      let correct = true;
      if (id === target && wrongAt < 0) {
        correct = false;
        wrongAt = i;
      } else if (id === target) {
        rights++;
      }
      practice = recordPracticeAnswer(next.practice, id, correct);
      if (rights === 2) break;
    }
    expect(wrongAt).toBeGreaterThanOrEqual(0);
    const comebacks = seen
      .map((id, i) => (id === target && i > wrongAt ? i : -1))
      .filter((i) => i >= 0);
    expect(comebacks[0]! - wrongAt).toBeLessThanOrEqual(5);
    expect(comebacks[0]! - wrongAt).toBeGreaterThanOrEqual(3);
    expect(comebacks[1]! - comebacks[0]!).toBeLessThanOrEqual(5);
    expect(practice.relearn).toEqual([]);
  });

  it('keeps a card in the relearn queue while it keeps being answered wrong', () => {
    const ids = run(start(pool(20), {}, 5), {}, 100, (id) => id !== 'c0');
    const hits = ids.map((id, i) => (id === 'c0' ? i : -1)).filter((i) => i >= 0);
    expect(hits.length).toBeGreaterThan(10);
    hits.slice(1).forEach((h, i) => expect(h - (hits[i] as number)).toBeLessThanOrEqual(5));
  });

  it('picks weak cards more often than strong ones', () => {
    const cards = pool(10);
    const states = Object.fromEntries(
      cards.map((c, i) => [c.id, i < 3 ? weak(c.id) : strong(c.id)]),
    );
    const ids = run(start(cards, states, 11), states, 2000);
    const count = (pred: (i: number) => boolean) =>
      ids.filter((id) => pred(Number(id.slice(1)))).length;
    const perWeak = count((i) => i < 3) / 3;
    const perStrong = count((i) => i >= 3) / 7;
    expect(perWeak).toBeGreaterThan(perStrong * 2);
  });

  it('limits unseen cards to about 30% of the draw', () => {
    const cards = pool(20);
    const states = Object.fromEntries(cards.slice(0, 10).map((c) => [c.id, weak(c.id)]));
    const ids = run(start(cards, states, 4), states, 2000);
    const unseen = ids.filter((id) => Number(id.slice(1)) >= 10).length / ids.length;
    expect(unseen).toBeGreaterThan(0.15);
    expect(unseen).toBeLessThan(0.4);
  });

  it('favours cards in an active confusion pair', () => {
    const cards = [
      card('flag:a', 'flag', 'AA', 'A'),
      card('flag:b', 'flag', 'BB', 'B'),
      ...pool(10),
    ];
    const confusion: Confusion = {
      picked: 'A',
      truth: 'B',
      count: 3,
      lastSeen: now.toISOString(),
      contrastStreak: 0,
    };
    const ids = run(start(cards, {}, 9, [confusion]), {}, 3000);
    const share = (id: string) => ids.filter((x) => x === id).length;
    expect(share('flag:a')).toBeGreaterThan(share('c0') * 1.4);
  });

  it('ignores map-scoped confusions: state NL boosts neither the Netherlands nor any card', () => {
    const cards = [card('flag:nl', 'flag', 'NL', 'Netherlands'), ...pool(4)];
    const confusion: Confusion = {
      picked: 'ca:PE',
      truth: 'ca:NL',
      count: 5,
      lastSeen: now.toISOString(),
      contrastStreak: 0,
    };
    expect(start(cards, {}, 1, [confusion]).confused).toEqual([]);
  });

  it('chooses the mode like a session: mcq early, then the type recall mode', () => {
    const cards = [card('x', 'flag'), card('y', 'areacode'), card('z', 'lookalike')];
    const reviewed = (id: string): CardState => ({ ...strong(id), reps: 3 });
    const states = { x: reviewed('x'), y: reviewed('y'), z: reviewed('z') };
    let practice = start(cards, states);
    const modes: Record<string, string> = {};
    for (let i = 0; i < 12; i++) {
      const next = nextPracticeItem(practice, states, now);
      modes[next.item.cardId] = next.item.mode;
      practice = next.practice;
    }
    expect(modes).toEqual({ x: 'recall', y: 'map', z: 'binary' });
    expect(nextPracticeItem(start([card('n')]), {}, now).item.mode).toBe('mcq');
  });
});
