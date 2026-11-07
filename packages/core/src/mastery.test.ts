import { describe, expect, it } from 'vitest';
import { mastery, medalFor, nextMedal } from './mastery';
import { applyReview, knownCardState, newCardState } from './scheduler';

const now = new Date('2026-03-01T12:00:00Z');

describe('mastery', () => {
  it('is 0 for an empty set', () => {
    expect(mastery([], {}, now)).toBe(0);
  });

  it('averages recall odds a week ahead, counting unseen and new cards as 0', () => {
    const known = knownCardState('a', now, 0.9);
    const later = new Date('2026-03-03T12:00:00Z');
    const states = { a: known, b: newCardState('b', now) };
    // Reviewed on Mar 1, measured at Mar 10: 9 days on a 90%-at-S-days curve.
    expect(mastery(['a', 'b', 'c'], states, later)).toBeCloseTo(0.9 ** (9 / known.stability) / 3);
  });

  it('rates a card due in exactly a week at 90%', () => {
    const state = { ...knownCardState('a', now, 0.9), stability: 7 };
    expect(mastery(['a'], { a: state }, now)).toBeCloseTo(0.9);
  });

  it('scores a card answered wrong once below bronze, right after the review', () => {
    const lapsed = applyReview(newCardState('a', now), 'again', now, 0.9);
    expect(mastery(['a'], { a: lapsed }, now)).toBeLessThan(0.25);
  });

  it('scores a card reviewed Good several times over weeks as gold', () => {
    let state = newCardState('a', now);
    let at = now;
    for (let i = 0; i < 5; i++) {
      state = applyReview(state, 'good', at, 0.9);
      at = new Date(state.due);
    }
    expect(mastery(['a'], { a: state }, at)).toBeGreaterThan(0.8);
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
