import { describe, expect, it } from 'vitest';
import { mastery, medalFor, nextMedal } from './mastery';
import { knownCardState, newCardState, retrievability } from './scheduler';

const now = new Date('2026-03-01T12:00:00Z');

describe('mastery', () => {
  it('is 0 for an empty set', () => {
    expect(mastery([], {}, now)).toBe(0);
  });

  it('averages retrievability, counting unseen and new cards as 0', () => {
    const known = knownCardState('a', now, 0.9);
    const later = new Date('2026-03-03T12:00:00Z');
    const states = { a: known, b: newCardState('b', now) };
    expect(mastery(['a', 'b', 'c'], states, later)).toBeCloseTo(retrievability(known, later) / 3);
  });
});

describe('medalFor', () => {
  it.each([
    [1, 'gold'],
    [0.8, 'gold'],
    [0.7999, 'silver'],
    [0.5, 'silver'],
    [0.4999, 'bronze'],
    [0.25, 'bronze'],
    [0.2499, null],
    [0, null],
  ])('%s → %s', (pct, medal) => {
    expect(medalFor(pct)).toBe(medal);
  });
});

describe('nextMedal', () => {
  it.each([
    [0, { medal: 'bronze', at: 0.25 }],
    [0.25, { medal: 'silver', at: 0.5 }],
    [0.5, { medal: 'gold', at: 0.8 }],
    [0.79, { medal: 'gold', at: 0.8 }],
    [0.8, null],
  ])('%s → %o', (pct, next) => {
    expect(nextMedal(pct)).toEqual(next);
  });
});
