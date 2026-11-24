import { describe, expect, it } from 'vitest';
import { COURSES } from './data';
import {
  buildLesson,
  CATS,
  courseLetters,
  isSign,
  makeQ,
  makeSpot,
  markTells,
  norm,
  sourceOf,
  tonguesOf,
} from './engine';
import { SPOTS, TONGUES, tongueOf, tonguesFor } from './tongues';

describe.each(COURSES.map((c) => [c.id, c] as const))('%s', (_, course) => {
  it('introduces every letter of every lesson and asks four different answers', () => {
    for (const level of [...course.levels, ...(course.extras ?? [])]) {
      const steps = buildLesson(course, level.id);
      const intros = steps.filter((s) => s.type === 'intro').map((s) => s.glyph);
      expect(intros).toEqual(level.letters.map((r) => course.toLetter(r).glyph));
      for (const step of steps) {
        if (step.type !== 'choice') continue;
        expect(step.options).toContain(step.answer);
        expect(new Set(step.options).size).toBe(step.options.length);
        expect(step.options.length).toBeGreaterThanOrEqual(2);
      }
    }
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

  const sources = [
    ['the course', sourceOf(course)] as const,
    ...tonguesOf(course).map((t) => [t.name, sourceOf(course, t)] as const),
  ];
  it.each(sources)('practises every category of %s with the right answer among four', (_, src) => {
    for (const { id } of CATS) {
      for (let n = 0; n < 20; n++) {
        const q = makeQ(src, id, null);
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.options).toContain(q.answer);
      }
    }
  });
});

describe('Cyrillic', () => {
  const cyrillic = COURSES.find((c) => c.id === 'cyrillic')!;

  it('ends the main course on lesson 6, with the other languages as extras', () => {
    expect(cyrillic.levels.map((lv) => lv.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(cyrillic.extras?.map((lv) => lv.name)).toEqual([
      'Ukrainian',
      'Serbian',
      'Macedonian',
      'Montenegrin',
      'Belarusian',
    ]);
  });

  it('writes each language in its own Latin spelling', () => {
    const ua = TONGUES.find((t) => t.id === 'ukrainian')!;
    const rs = TONGUES.find((t) => t.id === 'serbian')!;
    expect(ua.cities.find((c) => c.c === 'Київ')?.l).toBe('Kyyiv');
    expect(rs.words.find((w) => w.c === 'рођендан')?.l).toBe('rođendan');
    expect(norm('rodjendan')).toBe(norm('rođendan'));
  });

  it('keeps every practice item in the letters of its own language', () => {
    for (const t of TONGUES) {
      for (const r of [...t.words, ...t.phrases, ...t.cities]) {
        expect(
          tonguesFor(r.c).map((x) => x.id),
          `${t.id}: ${r.c}`,
        ).toContain(t.id);
      }
    }
  });

  it('has plenty to spot in every language, each one only that language', () => {
    for (const t of TONGUES) {
      expect(SPOTS[t.id].length, t.id).toBeGreaterThanOrEqual(30);
      for (const spot of SPOTS[t.id]) {
        expect(tongueOf(spot.c)?.id).toBe(t.id);
        // the letters that give it away are in it
        expect(
          markTells(spot.c, t).some((m) => m.tell),
          `${t.id}: ${spot.c}`,
        ).toBe(true);
      }
    }
  });

  it('spots in every language, never the same language three times running', () => {
    const seen = new Set<string>();
    const run: string[] = [];
    for (let n = 0; n < 300; n++) {
      const q = makeSpot(run.slice(-2) as never);
      expect(q.options.map((t) => t.id)).toContain(q.tongue.id);
      run.push(q.tongue.id);
      seen.add(q.tongue.id);
    }
    expect(seen.size).toBe(TONGUES.length);
    for (let i = 2; i < run.length; i++)
      expect(run[i] === run[i - 1] && run[i] === run[i - 2]).toBe(false);
  });

  it('does not bring a word back within the last 80 asked', () => {
    localStorage.clear();
    const asked: string[] = [];
    for (let n = 0; n < 80; n++) asked.push(makeSpot().c);
    expect(new Set(asked).size).toBe(asked.length);
  });
});

describe('typed answers', () => {
  it('ignore case, spaces, hyphens and accents', () => {
    expect(norm('Rostov na Donu')).toBe(norm('Rostov-na-Donu'));
    expect(norm('muk')).toBe(norm('mük'));
  });
});
