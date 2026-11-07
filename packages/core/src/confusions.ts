import type { Confusion } from './types';

export const CONTRAST_MIN_COUNT = 3;
export const CONTRAST_STREAK_TO_RESOLVE = 5;
const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export interface Pair {
  picked: string;
  truth: string;
}

export function pairKey(pair: Pair): string {
  return `${pair.picked}|${pair.truth}`;
}

export function parsePairKey(key: string): Pair {
  const [picked = '', truth = ''] = key.split('|');
  return { picked, truth };
}

const isPair = (c: Confusion, pair: Pair) => c.picked === pair.picked && c.truth === pair.truth;
const isRecent = (c: Confusion, now: Date) => now.getTime() - Date.parse(c.lastSeen) <= WINDOW_MS;

/**
 * Wrong answers upsert the (picked, truth) pair. The count restarts once the previous miss is
 * older than the 14-day window, so it approximates "misses in the last 14 days".
 */
export function recordAnswer(
  confusions: Confusion[],
  picked: string,
  truth: string,
  correct: boolean,
  now: Date,
): Confusion[] {
  if (correct) return confusions;
  const pair = { picked, truth };
  const existing = confusions.find((c) => isPair(c, pair));
  const nowIso = now.toISOString();
  if (!existing) {
    return [...confusions, { picked, truth, count: 1, lastSeen: nowIso, contrastStreak: 0 }];
  }
  const lastSeen = existing.lastSeen > nowIso ? existing.lastSeen : nowIso;
  const count = isRecent(existing, now) ? existing.count + 1 : 1;
  return confusions.map((c) => (c === existing ? { ...c, count, lastSeen, contrastStreak: 0 } : c));
}

/** A contrast answer extends or breaks the streak; reaching 5 resolves the pair (count resets). */
export function contrastResult(confusions: Confusion[], pair: Pair, correct: boolean): Confusion[] {
  return confusions.map((c) => {
    if (!isPair(c, pair)) return c;
    const contrastStreak = correct ? c.contrastStreak + 1 : 0;
    const resolved = contrastStreak >= CONTRAST_STREAK_TO_RESOLVE;
    return { ...c, contrastStreak, count: resolved ? 0 : c.count };
  });
}

/** Pairs due a contrast round, most frequent first. */
export function activePairs(confusions: Confusion[], now: Date): Confusion[] {
  return confusions
    .filter(
      (c) =>
        c.count >= CONTRAST_MIN_COUNT &&
        c.contrastStreak < CONTRAST_STREAK_TO_RESOLVE &&
        isRecent(c, now),
    )
    .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen));
}
