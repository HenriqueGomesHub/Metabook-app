import { CITIES, LEVELS, WORDS } from './data';
import type { Letter } from './data';

/* ---------- shared helpers ---------- */
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

/** Latin letters that are easy to mix up, for wrong answers that look plausible. */
const CONFUSE: Record<string, string> = {
  a: 'o',
  o: 'a',
  e: 'i',
  i: 'e',
  u: 'y',
  y: 'u',
  v: 'b',
  b: 'v',
  n: 'h',
  h: 'n',
  r: 'p',
  p: 'r',
  s: 'c',
  c: 's',
  k: 'g',
  g: 'k',
  d: 't',
  t: 'd',
  f: 'v',
  m: 'n',
  l: 'r',
  z: 's',
};
const FILLERS = 'aeioubvkrsntmldgz'.split('');
const pickOne = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;

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

const lettersOf = (word: string) => uniq(word.split(''));
/** The soft and hard signs: no Latin letter of their own. */
export const isSign = (L: Letter) => L.l === '—';

/** A lesson step: a new letter shown, or a question with four answers. */
export type Exercise =
  | ({ type: 'intro' } & Letter)
  | {
      type: 'choice';
      mode: 'c2l' | 'l2c' | 'word';
      q: string;
      big: string;
      bigCyr: boolean;
      optCyr: boolean;
      answer: string;
      options: string[];
    };

/* ---------- lesson builder ---------- */
export function buildLesson(idx: number): Exercise[] {
  const level = LEVELS[idx];
  if (!level) return [];
  const learnedLetters: Letter[] = [];
  for (let i = 0; i <= idx; i++) learnedLetters.push(...(LEVELS[i]?.letters ?? []));
  const learnedSet = new Set(learnedLetters.map((x) => x.c.toLowerCase()));
  const newSet = new Set(level.letters.map((x) => x.c.toLowerCase()));
  const latinPool = learnedLetters.map((x) => x.l);
  const cyrPool = learnedLetters.map((x) => x.c);

  const mkC2L = (L: Letter): Exercise => ({
    type: 'choice',
    mode: 'c2l',
    q: 'Write this in the Latin alphabet',
    big: L.c,
    bigCyr: true,
    optCyr: false,
    answer: L.l,
    options: shuffle([L.l, ...sampleDistinct(latinPool, 3, L.l)]),
  });
  const mkL2C = (L: Letter): Exercise => ({
    type: 'choice',
    mode: 'l2c',
    q: 'Which Cyrillic letter becomes this?',
    big: L.l,
    bigCyr: false,
    optCyr: true,
    answer: L.c,
    options: shuffle([L.c, ...sampleDistinct(cyrPool, 3, L.c)]),
  });
  const drillFor = (L: Letter, i: number) => (i % 2 === 0 ? mkC2L(L) : mkL2C(L));

  // Teach in small batches: introduce ~3 letters, drill them (mixing earlier
  // ones back in for repetition), then continue. Finish with a full review.
  const BATCH = 3;
  const out: Exercise[] = [];
  const taught: Letter[] = []; // non-sign letters introduced so far in this lesson

  for (let b = 0; b < level.letters.length; b += BATCH) {
    const batch = level.letters.slice(b, b + BATCH);
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

  // Final review — every letter from this lesson once more, plus real words.
  const review = taught.map((L, i) => drillFor(L, i + 1));
  const available = WORDS.filter((w) => lettersOf(w.c).every((ch) => learnedSet.has(ch)));
  const hasNew = (c: string) => (lettersOf(c).some((ch) => newSet.has(ch)) ? 1 : 0);
  available.sort((a, b) => hasNew(b.c) - hasNew(a.c));
  const words = shuffle(available.slice(0, Math.min(8, available.length)))
    .slice(0, 3)
    .map((w): Exercise => ({
      type: 'choice',
      mode: 'word',
      q: 'Write this word in Latin letters',
      big: w.c,
      bigCyr: true,
      optCyr: false,
      answer: w.l,
      options: shuffle([w.l, ...makeWordDistractors(w.l, 3)]),
    }));
  out.push(...shuffle([...review, ...words]));

  return out;
}

/* ---------- endless practice questions ---------- */
export interface PracticeQuestion {
  c: string;
  answer: string;
  options: string[];
  /** a word or a place, not a single letter */
  phrase: boolean;
}

/* every real letter (signs excluded — they have no single Latin form) */
const ALL_LETTERS = LEVELS.flatMap((lv) => lv.letters).filter((L) => !isSign(L));
const ALL_LATIN = uniq(ALL_LETTERS.map((L) => L.l));
function makeEndlessQ(prevC: string | null): PracticeQuestion {
  let L: Letter;
  do {
    L = pickOne(ALL_LETTERS);
  } while (prevC && L.c === prevC);
  return {
    c: L.c,
    answer: L.l,
    options: shuffle([L.l, ...sampleDistinct(ALL_LATIN, 3, L.l)]),
    phrase: false,
  };
}

export type PracticeCategory = 'letters' | 'words' | 'cities';

/* endless categories: letters, words, or Cyrillic city names */
export const CATS: { id: PracticeCategory; label: string; prompt: string }[] = [
  { id: 'letters', label: 'Letters', prompt: 'Which letter is this?' },
  { id: 'words', label: 'Words', prompt: 'Read this word' },
  { id: 'cities', label: 'Cities', prompt: 'Read this place' },
];

export function makeQ(cat: PracticeCategory, prevC: string | null): PracticeQuestion {
  if (cat === 'letters') return makeEndlessQ(prevC);
  const src = cat === 'words' ? WORDS : CITIES;
  let item = pickOne(src);
  while (prevC && item.c === prevC && src.length > 1) item = pickOne(src);
  return {
    c: item.c,
    answer: item.l,
    options: shuffle([item.l, ...makeWordDistractors(item.l, 3)]),
    phrase: true,
  };
}

/* forgiving compare for typed answers: case / spaces / hyphens don't matter */
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
