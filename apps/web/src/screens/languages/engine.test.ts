import { describe, expect, it } from 'vitest';
import { COURSES } from './data';
import { buildLesson, CATS, courseLetters, isSign, makeQ, norm } from './engine';

describe.each(COURSES.map((c) => [c.id, c] as const))('%s', (_, course) => {
  it('introduces every letter of every lesson and asks four different answers', () => {
    course.levels.forEach((level, i) => {
      const steps = buildLesson(course, i);
      const intros = steps.filter((s) => s.type === 'intro').map((s) => s.glyph);
      expect(intros).toEqual(level.letters.map((r) => course.toLetter(r).glyph));
      for (const step of steps) {
        if (step.type !== 'choice') continue;
        expect(step.options).toContain(step.answer);
        expect(new Set(step.options).size).toBe(step.options.length);
        expect(step.options.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  it('has a Latin reading for every letter, and words, places and phrases to practise', () => {
    for (const L of courseLetters(course)) {
      expect(L.glyph, `${course.id} letter`).toBeTruthy();
      expect(L.l).toBeTruthy();
    }
    expect(courseLetters(course).filter((L) => !isSign(L)).length).toBeGreaterThan(3);
    expect(course.words.length).toBeGreaterThan(0);
    expect(course.cities.length).toBeGreaterThan(0);
    expect(course.phrases.length).toBeGreaterThan(0);
  });

  it('practises every category with the right answer among four', () => {
    for (const { id } of CATS) {
      for (let n = 0; n < 20; n++) {
        const q = makeQ(course, id, null);
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.options).toContain(q.answer);
      }
    }
  });
});

describe('typed answers', () => {
  it('ignore case, spaces, hyphens and accents', () => {
    expect(norm('Rostov na Donu')).toBe(norm('Rostov-na-Donu'));
    expect(norm('muk')).toBe(norm('mük'));
  });
});
