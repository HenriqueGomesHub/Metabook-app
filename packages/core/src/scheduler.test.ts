import { describe, expect, it } from 'vitest';
import {
  applyReview,
  gradeAnswer,
  knownCardState,
  newCardState,
  retrievability,
} from './scheduler';

const now = new Date('2026-03-01T12:00:00Z');
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe('newCardState', () => {
  it('is a new card due now', () => {
    expect(newCardState('flag:lt', now)).toEqual({
      cardId: 'flag:lt',
      due: now.toISOString(),
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      learningSteps: 0,
      reps: 0,
      lapses: 0,
      state: 'new',
    });
  });
});

describe('applyReview successes', () => {
  it('counts hard, good and easy but not again', () => {
    let state = newCardState('a', now);
    for (const grade of ['again', 'hard', 'good', 'easy', 'again'] as const) {
      state = applyReview(state, grade, now, 0.9);
    }
    expect(state.successes).toBe(3);
  });

  it('continues from reps - lapses when the field is missing', () => {
    const legacy = { ...knownCardState('a', now, 0.9), reps: 5, lapses: 2 };
    expect(applyReview(legacy, 'good', now, 0.9).successes).toBe(4);
  });
});

describe('applyReview', () => {
  it('moves a new card into learning on Good', () => {
    const next = applyReview(newCardState('a', now), 'good', now, 0.9);
    expect(next).toMatchObject({
      cardId: 'a',
      state: 'learning',
      reps: 1,
      lastReview: now.toISOString(),
    });
    expect(Date.parse(next.due)).toBeGreaterThan(now.getTime());
  });

  it('round-trips through FSRS across several reviews and counts lapses', () => {
    let state = newCardState('a', now);
    state = applyReview(state, 'easy', now, 0.9);
    expect(state.state).toBe('review');
    const due = new Date(state.due);
    state = applyReview(state, 'again', due, 0.9);
    expect(state).toMatchObject({ state: 'relearning', lapses: 1, reps: 2 });
  });

  it('schedules longer intervals for lower desired retention', () => {
    const base = knownCardState('a', now, 0.9);
    const at = new Date(base.due);
    const strict = applyReview(base, 'good', at, 0.95);
    const loose = applyReview(base, 'good', at, 0.8);
    expect(loose.scheduledDays).toBeGreaterThan(strict.scheduledDays);
  });
});

describe('knownCardState', () => {
  it('graduates straight to review after one Good', () => {
    expect(knownCardState('a', now, 0.9)).toMatchObject({
      state: 'review',
      reps: 1,
      scheduledDays: 3,
    });
  });
});

describe('gradeAnswer', () => {
  const base = { correct: true, usedHint: false, msTaken: 8000, medianMs: 10_000 };

  it('maps wrong to again, even when fast or hinted', () => {
    expect(gradeAnswer({ ...base, correct: false, usedHint: true, msTaken: 100 })).toBe('again');
  });

  it('maps a hinted correct answer to hard, even when fast', () => {
    expect(gradeAnswer({ ...base, usedHint: true, msTaken: 100 })).toBe('hard');
  });

  it('maps fast answers to easy: under 40% of the median or under 3s', () => {
    expect(gradeAnswer({ ...base, msTaken: 3999 })).toBe('easy');
    expect(gradeAnswer({ ...base, msTaken: 4000 })).toBe('good');
    expect(gradeAnswer({ ...base, msTaken: 2999, medianMs: 2000 })).toBe('easy');
    expect(gradeAnswer({ ...base, msTaken: 3000, medianMs: 2000 })).toBe('good');
  });
});

describe('retrievability', () => {
  it('is 0 for an unseen card', () => {
    expect(retrievability(newCardState('a', now), days(10))).toBe(0);
  });

  it('starts near 1 and decays over time', () => {
    const state = knownCardState('a', now, 0.9);
    const soon = retrievability(state, now);
    const later = retrievability(state, days(30));
    expect(soon).toBeCloseTo(1, 2);
    expect(later).toBeGreaterThan(0);
    expect(later).toBeLessThan(soon);
  });
});
