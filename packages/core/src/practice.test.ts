import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import {
  cardForItem,
  createPractice,
  nextPracticeItem,
  recordPracticeAnswer,
  type PracticeState,
} from './practice';
import { applyReview, newCardState } from './scheduler';
import { LEARN_GAP } from './session';
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

  it('does not repeat any of the last 3 cards in a pool of 6 (gap = pool / 2)', () => {
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

  // Updated for the learning queue: after its wrong-answer return, a card answered right comes back
  // after the usual spacing (min(10, pool / 2) cards), not within 5, and graduates on the second
  // right in a row.
  it('brings a wrong card back after 3-5 other cards, then spaces it and graduates it', () => {
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
    const comebacks = seen
      .map((id, i) => (id === target && i > wrongAt ? i : -1))
      .filter((i) => i >= 0);
    expect(comebacks[0]! - wrongAt).toBeGreaterThanOrEqual(4);
    expect(comebacks[0]! - wrongAt).toBeLessThanOrEqual(6);
    expect(comebacks[1]! - comebacks[0]!).toBeGreaterThan(10);
    expect(practice.learning.map((l) => l.cardId)).not.toContain(target);
    expect(practice.resting).toContain(target);
  });

  it('keeps bringing a card back after 3-5 others while it keeps being answered wrong', () => {
    const ids = run(start(pool(20), {}, 5), {}, 100, (id) => id !== 'c0');
    const hits = ids.map((id, i) => (id === 'c0' ? i : -1)).filter((i) => i >= 0);
    expect(hits.length).toBeGreaterThan(10);
    hits.slice(1).forEach((h, i) => {
      expect(h - (hits[i] as number)).toBeGreaterThanOrEqual(4);
      expect(h - (hits[i] as number)).toBeLessThanOrEqual(6);
    });
  });

  // Pool of 30 and 1.5x (were 10 and 2x): the spacing rule (no repeat within min(10, pool / 2)
  // cards) now caps how often a weak card can come back, so the weighting shows less.
  it('serves every card in each pass before any learnt card comes back', () => {
    const cards = pool(40);
    const ids = run(start(cards, {}, 5), {}, 400);
    // all right: a pass is 2 showings per card, so the first 80 cover the whole pool
    expect(new Set(ids.slice(0, 80)).size).toBe(40);
    for (const c of cards) expect(ids.filter((id) => id === c.id).length).toBeGreaterThanOrEqual(8);
  });

  it('picks weak cards more often than strong ones', () => {
    const cards = pool(30);
    const states = Object.fromEntries(
      cards.map((c, i) => [c.id, i < 3 ? weak(c.id) : strong(c.id)]),
    );
    const ids = run(start(cards, states, 11), states, 2000);
    const count = (pred: (i: number) => boolean) =>
      ids.filter((id) => pred(Number(id.slice(1)))).length;
    const perWeak = count((i) => i < 3) / 3;
    const perStrong = count((i) => i >= 3) / 27;
    expect(perWeak).toBeGreaterThan(perStrong * 1.5);
  });

  // Replaces "limits unseen cards to about 30% of the draw": that cap was the bug (a few seen cards
  // took 70% of the draws). Known cards are now mixed in at about 25% beside the learning set.
  it('mixes known cards in at about a quarter while new cards are being learnt', () => {
    const cards = pool(60);
    const states = Object.fromEntries(cards.slice(0, 20).map((c) => [c.id, weak(c.id)]));
    const ids = run(start(cards, states, 4), states, 60, (_, i) => i % 3 !== 0);
    const known = ids.filter((id) => Number(id.slice(1)) < 20).length / ids.length;
    expect(known).toBeGreaterThan(0.1);
    expect(known).toBeLessThan(0.45);
  });

  it('favours cards in an active confusion pair', () => {
    const cards = [
      card('flag:a', 'flag', 'AA', 'A'),
      card('flag:b', 'flag', 'BB', 'B'),
      // 30 others (was 10), for the same reason as the weak-card test
      ...pool(30),
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
    // three rights in a row to learn it each pass, against two
    expect(share('flag:a')).toBeGreaterThan(share('c0') * 1.25);
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

/** Brazil's 67 area-code cards, as shipped. */
const areaCodes = (
  JSON.parse(
    readFileSync(new URL('../../../content/cards/brazil.json', import.meta.url), 'utf8'),
  ) as Card[]
).filter((c) => c.type === 'areacode');
const codeOf = (id: string) => Number(id.split(':').at(-1));

/**
 * Practice as the app runs it: each answer is also graded into the card's FSRS state, and the
 * next draw sees the new state. `right` decides each answer from a seeded rng.
 */
function realistic(cards: Card[], seed: number, steps: number, rightShare = 0.85) {
  const answers = mulberry32(seed * 101);
  let states: Record<string, CardState> = {};
  let time = now.getTime();
  let practice = createPractice({ cards, states, confusions: [], now, rng: mulberry32(seed) });
  const ids: string[] = [];
  const wrong: boolean[] = [];
  for (let i = 0; i < steps; i++) {
    const at = new Date(time);
    const next = nextPracticeItem(practice, states, at);
    const id = next.item.cardId;
    const correct = answers() < rightShare;
    ids.push(id);
    wrong.push(!correct);
    const state = states[id] ?? newCardState(id, at);
    states = { ...states, [id]: applyReview(state, correct ? 'good' : 'again', at, 0.9) };
    practice = recordPracticeAnswer(next.practice, id, correct);
    time += 8000;
  }
  return { ids, wrong, practice };
}

describe('practice on the 67 Brazilian area codes', () => {
  it('has the shipped pool', () => expect(areaCodes).toHaveLength(67));

  // Regression: the old draw capped unseen cards at 30% of the weight, so the first four seen
  // codes took about 70% of the draws and cycled (81, 35, 62, 92, 81, 35, 62, 92...): only 20-34
  // distinct codes in the first 120 cards, and 76-85 repeats within 10 cards of a right answer.
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`covers the pool, spaces repeats and avoids neighbouring codes (seed ${seed})`, () => {
      const { ids, wrong } = realistic(areaCodes, seed, 300);
      expect(new Set(ids.slice(0, 120)).size).toBe(67);
      const last = new Map<string, number>();
      ids.forEach((id, i) => {
        const before = last.get(id);
        if (before !== undefined) {
          const gap = i - before;
          if (wrong[before]) expect(gap).toBeGreaterThanOrEqual(3);
          else expect(gap).toBeGreaterThan(10);
        }
        last.set(id, i);
      });
      for (let i = 2; i < ids.length; i++) {
        const run = [ids[i - 2], ids[i - 1], ids[i]].map((id) => codeOf(id as string));
        const [a, b, c] = run.sort((x, y) => x - y) as [number, number, number];
        expect(b - a === 1 && c - b === 1).toBe(false);
      }
      for (let i = 1; i < ids.length; i++) {
        expect(Math.abs(codeOf(ids[i] as string) - codeOf(ids[i - 1] as string))).toBeGreaterThan(
          2,
        );
      }
    });
  }

  it('keeps two codes of one state apart, but for a missed card at its deadline', () => {
    const byId = new Map(areaCodes.map((c) => [c.id, c]));
    for (const seed of [1, 2, 3, 4, 5]) {
      const { ids, wrong } = realistic(areaCodes, seed, 300);
      const back = ids.filter(
        (id, i) => i > 0 && byId.get(id)!.answer === byId.get(ids[i - 1]!)!.answer,
      ).length;
      // only a missed card forced back at its deadline may land next to its own state
      expect(back).toBeLessThanOrEqual(wrong.filter(Boolean).length / 4);
    }
  });

  it('brings every wrong card back within 3 to 6 cards', () => {
    for (const seed of [1, 2, 3]) {
      const { ids, wrong } = realistic(areaCodes, seed, 300, 0.7);
      ids.forEach((id, i) => {
        if (!wrong[i]) return;
        const back = ids.indexOf(id, i + 1);
        if (back < 0) return;
        expect(back - i).toBeGreaterThanOrEqual(3);
        expect(back - i).toBeLessThanOrEqual(6);
      });
    }
  });

  it('introduces new cards in a random order, not pool order', () => {
    const { ids } = realistic(areaCodes, 1, 10, 1);
    const firstFive = ids.slice(0, 5).map(codeOf);
    const sorted = [...firstFive].sort((a, b) => a - b);
    expect(firstFive).not.toEqual(sorted);
    expect(firstFive).not.toEqual(areaCodes.slice(0, 5).map((c) => codeOf(c.id)));
  });

  it('graduates a card after two rights in a row and then rests it while others remain', () => {
    const { ids, practice } = realistic(areaCodes, 2, 100, 1);
    const first = ids[0] as string;
    const hits = ids.map((id, i) => (id === first ? i : -1)).filter((i) => i >= 0);
    expect(hits).toHaveLength(2);
    expect(practice.resting).toContain(first);
    expect(practice.learning.map((l) => l.cardId)).not.toContain(first);
  });

  it('is deterministic for a seed', () => {
    expect(realistic(areaCodes, 9, 150).ids).toEqual(realistic(areaCodes, 9, 150).ids);
  });
});

describe('practice image rotation', () => {
  /** Spot it cards of one clue with three images, among filler cards. */
  const spot = (image: string): Card => ({
    ...card(`clue:pl-1:spot:${image}`, 'spot', 'PL', 'Poland'),
    prompt: { kind: 'image', value: `https://img/${image}.png` },
    clue: { id: 'pl-1', image: { id: image, src: `https://img/${image}.png` } },
  });
  const cards = [spot('a'), spot('b'), spot('c'), ...pool(12)];

  it('shows a repeat of a Spot it card with the clue image seen longest ago', () => {
    let practice = start(cards, {}, 3);
    const shown: { cardId: string; image: string }[] = [];
    for (let i = 0; i < 120; i++) {
      const next = nextPracticeItem(practice, {}, now);
      const shownCard = cardForItem(next.item, cards)!;
      expect(shownCard.id).toBe(next.item.cardId);
      if (shownCard.clue?.image) {
        expect(shownCard.prompt.value).toBe(`https://img/${shownCard.clue.image.id}.png`);
        shown.push({ cardId: next.item.cardId, image: shownCard.clue.image.id });
      }
      practice = recordPracticeAnswer(next.practice, next.item.cardId, i % 3 !== 0);
    }
    // the clue's photos never repeat back to back while another one exists
    shown.forEach((s, i) => i > 0 && expect(s.image).not.toBe(shown[i - 1]!.image));
    // and repeats of one card do not always show its own photo
    expect(shown.some((s) => !s.cardId.endsWith(`:${s.image}`))).toBe(true);
  });

  it('leaves a card with no sibling images as it is', () => {
    const single = [spot('a'), ...pool(6)];
    let practice = start(single);
    for (let i = 0; i < 40; i++) {
      const next = nextPracticeItem(practice, {}, now);
      expect(next.item.imageId).toBeUndefined();
      practice = recordPracticeAnswer(next.practice, next.item.cardId, false);
    }
  });
});

describe('first look at a new clue', () => {
  const spot = (id: string): Card => ({
    ...card(id, 'spot', `C${id}`),
    clue: { id: `clue-${id}`, image: { id: 'i', src: 'https://example.org/i.jpg' } },
  });

  it('shows a new spot clue once as a lesson, then quizzes it a few cards later', () => {
    const cards = Array.from({ length: 12 }, (_, i) => spot(`s${i}`));
    let practice = start(cards);
    const served: { id: string; mode: string }[] = [];
    for (let i = 0; i < 30; i++) {
      const next = nextPracticeItem(practice, {}, now);
      served.push({ id: next.item.cardId, mode: next.item.mode });
      practice = recordPracticeAnswer(next.practice, next.item.cardId, true);
    }
    const first = served[0]!;
    expect(first.mode).toBe('learn');
    const quiz = served.findIndex((s, i) => i > 0 && s.id === first.id);
    expect(quiz).toBeGreaterThan(LEARN_GAP);
    expect(served[quiz]!.mode).not.toBe('learn');
  });

  it('quizzes a clue the learner has already seen straight away', () => {
    const cards = [spot('s0'), spot('s1')];
    const states = { s0: strong('s0'), s1: strong('s1') };
    const next = nextPracticeItem(start(cards, states), states, now);
    expect(next.item.mode).not.toBe('learn');
  });
});
