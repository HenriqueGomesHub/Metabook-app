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

const MAP_SCOPED = /^([a-z]{2}):(.+)$/;

/**
 * The key a confusion stores for one of a card's answers: `<map>:<STATE>` ("ca:NL") on
 * regions-map cards and area codes outside Brazil, so a state code never reads as the country with
 * the same code.
 */
export function answerKey(
  card: { map?: string; type?: string; country?: string },
  answer: string,
): string {
  const map = card.map ?? areaCodeMap(card);
  return map ? `${map}:${answer}` : answer;
}

/**
 * The regions map an area-code card is answered on, when its answers need scoping: every country
 * but Brazil, whose area-code answers have always been bare state codes ("SP").
 */
export function areaCodeMap(card: { type?: string; country?: string }): string | undefined {
  if (card.type !== 'areacode' || !card.country || card.country.toUpperCase() === 'BR') {
    return undefined;
  }
  return card.country.toLowerCase();
}

/** The map and state of a map-scoped key; undefined for plain (country or answer) keys. */
export function parseMapKey(key: string): { map: string; code: string } | undefined {
  const match = MAP_SCOPED.exec(key);
  return match ? { map: match[1] as string, code: match[2] as string } : undefined;
}

export const isMapKey = (key: string): boolean => MAP_SCOPED.test(key);

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
