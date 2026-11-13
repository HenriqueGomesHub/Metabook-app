import { describe, expect, it } from 'vitest';
import {
  applyReview,
  gradeAnswer,
  reviewedToday,
  answerReview,
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

  it('grades a right answer good within 1.5x the median, hard when slower; never easy', () => {
    expect(gradeAnswer({ ...base, msTaken: 100 })).toBe('good');
    expect(gradeAnswer({ ...base, msTaken: 15_000 })).toBe('good');
    expect(gradeAnswer({ ...base, msTaken: 15_001 })).toBe('hard');
  });

  it('grades a same-session retry good, not by speed', () => {
    expect(gradeAnswer({ ...base, msTaken: 60_000, retry: true })).toBe('good');
  });

  it('caps a right pick out of two at hard', () => {
    expect(gradeAnswer({ ...base, msTaken: 500, choices: 2 })).toBe('hard');
    expect(gradeAnswer({ ...base, msTaken: 500, choices: 4 })).toBe('good');
  });
});

describe('reviewedToday', () => {
  it('is true only when the last review was on the same calendar day', () => {
    const morning = new Date(2026, 10, 13, 8);
    const state = applyReview(newCardState('a', morning), 'good', morning, 0.9);
    expect(reviewedToday(state, new Date(2026, 10, 13, 22))).toBe(true);
    expect(reviewedToday(state, new Date(2026, 10, 14, 0, 1))).toBe(false);
    expect(reviewedToday(newCardState('b', morning), morning)).toBe(false);
  });
});

describe('answerReview', () => {
  it('gives ten right answers in one sitting the stability of one', () => {
    const start = new Date(2026, 10, 13, 9);
    const once = answerReview(newCardState('a', start), 'good', start, 0.9);
    let many = newCardState('a', start);
    for (let i = 0; i < 10; i++) {
      many = answerReview(many, 'good', new Date(start.getTime() + i * 60_000), 0.9);
    }
    expect(many.stability).toBe(once.stability);
    expect(many.reps).toBe(1);
    expect(Date.parse(many.due)).toBeGreaterThanOrEqual(new Date(2026, 10, 14).getTime());
  });

  it('reviews again the next day', () => {
    const start = new Date(2026, 10, 13, 9);
    const first = answerReview(newCardState('a', start), 'good', start, 0.9);
    const next = answerReview(first, 'good', new Date(2026, 10, 14, 9), 0.9);
    expect(next.reps).toBe(2);
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
