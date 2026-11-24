import { COURSES } from './data';
import type { Course, Letter, Reading } from './data';

/* ---------- helpers ---------- */
const shuffle = <T>(arr: readonly T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
};
const uniq = <T>(arr: readonly T[]): T[] => [...new Set(arr)];
const sampleDistinct = (pool: readonly string[], n: number, exclude: string) =>
  shuffle(uniq(pool).filter((x) => x !== exclude)).slice(0, n);
const pickOne = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;
const lettersOf = (course: Course, word: string) => uniq(course.fold(word).split(''));
/** A silent sign (Ь, Ъ): no Latin letter of its own, taught but not asked. */
export const isSign = (L: { l: string }) => L.l === '—';

export const courseById = (id: string | undefined) => COURSES.find((c) => c.id === id);

/** Latin letters that are easy to mix up, for wrong answers that look plausible. */
const CONFUSE: Record<string, string> = {
  i: 'e',
  e: 'i',
  o: 'u',
  u: 'o',
  v: 'b',
  b: 'v',
  f: 'v',
  k: 'g',
  g: 'k',
  t: 'd',
  d: 't',
  s: 'z',
  z: 's',
  p: 'b',
  r: 'l',
  l: 'r',
  m: 'n',
  n: 'm',
  a: 'o',
  y: 'i',
  x: 'k',
  h: 'n',
  c: 's',
};
const FILLERS = 'aeiotsnrkmlpvfzd'.split('');

/** Wrong spellings of a word: one letter swapped for a lookalike, or two letters switched. */
function makeWordDistractors(correct: string, n = 3): string[] {
  const out = new Set<string>();
  const letterPos = [...correct].map((ch, i) => (/[a-z]/.test(ch) ? i : -1)).filter((i) => i >= 0);
  let guard = 0;
  while (out.size < n && guard < 400 && letterPos.length) {
    guard++;
    const chars = correct.split('');
    const pos = pickOne(letterPos);
    const ch = chars[pos] ?? '';
    if (CONFUSE[ch]) chars[pos] = CONFUSE[ch];
    else if (letterPos.length > 1) {
      const p2 = pickOne(letterPos.filter((p) => p !== pos));
      [chars[pos], chars[p2]] = [chars[p2] ?? '', chars[pos] ?? ''];
    } else chars[pos] = pickOne(FILLERS);
    const s = chars.join('');
    if (s !== correct) out.add(s);
  }
  while (out.size < n) out.add(correct + pickOne(FILLERS));
  return [...out].slice(0, n);
}

/** A lesson step: a new letter shown, or a question with four answers. */
export type Exercise =
  | ({ type: 'intro' } & Letter)
  | {
      type: 'choice';
      mode: 'c2l' | 'l2c' | 'word';
      q: string;
      big: string;
      /** the big prompt is in the script (not Latin) */
      bigScript: boolean;
      /** the answers are in the script */
      optScript: boolean;
      answer: string;
      options: string[];
    };

/* ---------- lesson builder ---------- */
export function buildLesson(course: Course, idx: number): Exercise[] {
  const lv = course.levels[idx];
  if (!lv) return [];
  const learned = course.levels.slice(0, idx + 1).flatMap((l) => l.letters.map(course.toLetter));
  const learnedSet = new Set(learned.map((L) => L.key));
  const newSet = new Set(lv.letters.map(course.toLetter).map((L) => L.key));
  const latinPool = learned.map((L) => L.l);

  const mkC2L = (L: Letter): Exercise => ({
    type: 'choice',
    mode: 'c2l',
    q: 'Write this in the Latin alphabet',
    big: L.glyph,
    bigScript: true,
    optScript: false,
    answer: L.l,
    options: shuffle([L.l, ...sampleDistinct(latinPool, 3, L.l)]),
  });
  const mkL2C = (L: Letter): Exercise => {
    // letters read the same way are not offered against each other, unless nothing else is left
    let distract = sampleDistinct(
      learned.filter((o) => o.glyph !== L.glyph && o.l !== L.l).map((o) => o.glyph),
      3,
      L.glyph,
    );
    if (distract.length < 3) {
      const same = shuffle(
        learned.filter((o) => o.glyph !== L.glyph && o.l === L.l).map((o) => o.glyph),
      );
      distract = uniq([...distract, ...same]).slice(0, 3);
    }
    return {
      type: 'choice',
      mode: 'l2c',
      q: course.l2cQ,
      big: L.l,
      bigScript: false,
      optScript: true,
      answer: L.glyph,
      options: shuffle([L.glyph, ...distract]),
    };
  };
  const drillFor = (L: Letter, i: number) => (i % 2 === 0 ? mkC2L(L) : mkL2C(L));

  // teach in batches of three: show the letters, drill them with two earlier ones mixed back in
  const BATCH = 3;
  const out: Exercise[] = [];
  const taught: Letter[] = [];
  for (let b = 0; b < lv.letters.length; b += BATCH) {
    const batch = lv.letters.slice(b, b + BATCH).map(course.toLetter);
    batch.forEach((L) => out.push({ type: 'intro', ...L }));
    const fresh = batch.filter((L) => !isSign(L));
    const drills = fresh.map((L, i) => drillFor(L, i));
    if (b > 0 && taught.length) {
      shuffle(taught)
        .slice(0, 2)
        .forEach((L, i) => drills.push(drillFor(L, i + 1)));
    }
    out.push(...shuffle(drills));
    taught.push(...fresh);
  }

  // the review: every letter of the lesson once more, plus real words made of known letters
  const review = taught.map((L, i) => drillFor(L, i + 1));
  const available = course.words.filter((w) =>
    lettersOf(course, w.c).every((ch) => learnedSet.has(ch)),
  );
  const hasNew = (w: Reading) => (lettersOf(course, w.c).some((ch) => newSet.has(ch)) ? 1 : 0);
  available.sort((a, b) => hasNew(b) - hasNew(a));
  const words = shuffle(available.slice(0, Math.min(8, available.length)))
    .slice(0, 3)
    .map((w): Exercise => ({
      type: 'choice',
      mode: 'word',
      q: 'Write this word in Latin letters',
      big: w.c,
      bigScript: true,
      optScript: false,
      answer: w.l,
      options: shuffle([w.l, ...makeWordDistractors(w.l, 3)]),
    }));
  out.push(...shuffle([...review, ...words]));
  return out;
}

/* ---------- endless practice ---------- */
export type PracticeCategory = 'letters' | 'words' | 'phrases' | 'cities';

export const CATS: { id: PracticeCategory; label: string; prompt: string }[] = [
  { id: 'letters', label: 'Letters', prompt: 'Which letter is this?' },
  { id: 'words', label: 'Words', prompt: 'Read this word' },
  { id: 'phrases', label: 'Phrases', prompt: 'Read this phrase' },
  { id: 'cities', label: 'Places', prompt: 'Read this place' },
];

export interface PracticeQuestion {
  c: string;
  answer: string;
  options: string[];
  /** a word, place or phrase, not a single letter */
  phrase: boolean;
  /** several words */
  multi: boolean;
}

export const courseLetters = (course: Course) =>
  course.levels.flatMap((lv) => lv.letters).map(course.toLetter);

export function makeQ(
  course: Course,
  cat: PracticeCategory,
  prevC: string | null,
): PracticeQuestion {
  if (cat === 'letters') {
    const all = courseLetters(course).filter((L) => !isSign(L));
    const latin = uniq(all.map((L) => L.l));
    let L = pickOne(all);
    while (prevC && L.glyph === prevC && all.length > 1) L = pickOne(all);
    return {
      c: L.glyph,
      answer: L.l,
      options: shuffle([L.l, ...sampleDistinct(latin, 3, L.l)]),
      phrase: false,
      multi: false,
    };
  }
  const src = cat === 'words' ? course.words : cat === 'phrases' ? course.phrases : course.cities;
  let item = pickOne(src);
  while (prevC && item.c === prevC && src.length > 1) item = pickOne(src);
  return {
    c: item.c,
    answer: item.l,
    options: shuffle([item.l, ...makeWordDistractors(item.l, 3)]),
    phrase: true,
    multi: cat === 'phrases',
  };
}

/* a typed answer is forgiving: case, spaces, hyphens and accents (ü, ö) don't matter */
export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/* ---------- progress of each course, kept in this browser ---------- */
export interface CourseProgress {
  completed: number[];
  bestStreaks: Record<PracticeCategory, number>;
}

export const EMPTY: CourseProgress = {
  completed: [],
  bestStreaks: { letters: 0, words: 0, phrases: 0, cities: 0 },
};

const KEY = 'metabook.alphabets';
/** the first Languages version kept Cyrillic alone under this key */
const OLD_CYRILLIC = 'metabook.cyrillic';

type AllProgress = Record<string, CourseProgress>;

function readAll(): AllProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AllProgress;
    const old = localStorage.getItem(OLD_CYRILLIC);
    if (old) {
      const saved = JSON.parse(old) as Partial<CourseProgress>;
      return {
        cyrillic: {
          completed: Array.isArray(saved.completed) ? saved.completed : [],
          bestStreaks: { ...EMPTY.bestStreaks, ...(saved.bestStreaks ?? {}) },
        },
      };
    }
  } catch {
    /* storage unavailable or unreadable: start fresh */
  }
  return {};
}

export function loadProgress(courseId: string): CourseProgress {
  const saved = readAll()[courseId];
  return {
    completed: Array.isArray(saved?.completed) ? saved.completed : [],
    bestStreaks: { ...EMPTY.bestStreaks, ...(saved?.bestStreaks ?? {}) },
  };
}

export function saveProgress(courseId: string, progress: CourseProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [courseId]: progress }));
  } catch {
    /* storage unavailable: progress lasts this visit */
  }
}

/** Letters learnt of a course: those of its finished lessons. */
export function courseProgress(course: Course) {
  const done = loadProgress(course.id).completed;
  const all = course.levels.reduce((n, lv) => n + lv.letters.length, 0);
  const learned = course.levels
    .filter((lv) => done.includes(lv.id))
    .reduce((n, lv) => n + lv.letters.length, 0);
  return { learned, all };
}

/* ---------- sound ---------- */
let audioCtx: AudioContext | null = null;

export function beep(kind: 'good' | 'bad') {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    const ctx = audioCtx;
    const play = (freq: number, start: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + start;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    if (kind === 'good') {
      play(659, 0, 0.1);
      play(988, 0.09, 0.16);
    } else play(160, 0, 0.2);
  } catch {
    /* audio unavailable */
  }
}

/* ---------- the course last opened, for "Continue" on the Languages page ---------- */
const LAST = 'metabook.alphabets.last';

export function lastCourse(): Course | undefined {
  try {
    return courseById(localStorage.getItem(LAST) ?? undefined);
  } catch {
    return undefined;
  }
}

export function setLastCourse(id: string) {
  try {
    localStorage.setItem(LAST, id);
  } catch {
    /* storage unavailable */
  }
}
