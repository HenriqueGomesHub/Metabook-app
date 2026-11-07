import type { Card } from './types';

const TYPO_MIN_LENGTH = 6;

export function normalizeAnswer(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Optimal string alignment distance (Levenshtein plus adjacent transpositions). */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => rows[i]?.[j] ?? Infinity;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, at(i - 2, j - 2) + 1);
      }
      (rows[i] as number[])[j] = d;
    }
  }
  return at(a.length, b.length);
}

export function matchesAnswer(
  input: string,
  card: Pick<Card, 'answer' | 'aliases'>,
  others: readonly string[] = [],
): boolean {
  const guess = normalizeAnswer(input);
  if (!guess) return false;
  const isOtherAnswer = others.some((other) => normalizeAnswer(other) === guess);
  return [card.answer, ...(card.aliases ?? [])].some((candidate) => {
    const target = normalizeAnswer(candidate);
    return (
      guess === target ||
      (!isOtherAnswer && target.length >= TYPO_MIN_LENGTH && editDistance(guess, target) <= 1)
    );
  });
}
