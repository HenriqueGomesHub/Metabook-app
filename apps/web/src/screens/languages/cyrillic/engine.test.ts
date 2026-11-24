import { describe, expect, it } from 'vitest';
import { LEVELS } from './data';
import { CATS, buildLesson, makeQ, norm } from './engine';

describe('Cyrillic lessons', () => {
  it('introduces every letter of each lesson and asks four-answer questions', () => {
    LEVELS.forEach((level, i) => {
      const steps = buildLesson(i);
      const intros = steps.filter((s) => s.type === 'intro').map((s) => s.c);
      expect(intros).toEqual(level.letters.map((l) => l.c));
      for (const step of steps) {
        if (step.type !== 'choice') continue;
        expect(step.options).toHaveLength(4);
        expect(new Set(step.options).size).toBe(4);
        expect(step.options).toContain(step.answer);
      }
    });
  });

  it('teaches a letter before asking it', () => {
    const steps = buildLesson(1);
    const firstAsk = steps.findIndex((s) => s.type === 'choice');
    expect(steps[0]?.type).toBe('intro');
    expect(firstAsk).toBeGreaterThan(0);
  });
});

describe('Cyrillic practice', () => {
  it('gives four different answers, one right, in every category', () => {
    for (const { id } of CATS) {
      for (let n = 0; n < 30; n++) {
        const q = makeQ(id, null);
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.options).toContain(q.answer);
      }
    }
  });

  it('accepts a typed answer whatever its case, spaces or hyphens', () => {
    expect(norm('Rostov na Donu')).toBe(norm('Rostov-na-Donu'));
  });
});
