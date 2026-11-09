import { describe, expect, it } from 'vitest';
import {
  activePairs,
  answerKey,
  contrastResult,
  isMapKey,
  pairKey,
  parseMapKey,
  parsePairKey,
  recordAnswer,
} from './confusions';
import type { Confusion } from './types';

const now = new Date('2026-03-15T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const pair = { picked: 'RS', truth: 'BG' };

const missTimes = (times: number, at = now): Confusion[] =>
  Array.from({ length: times }).reduce<Confusion[]>(
    (acc) => recordAnswer(acc, 'RS', 'BG', false, at),
    [],
  );

describe('pair keys', () => {
  it('round-trips', () => {
    expect(parsePairKey(pairKey(pair))).toEqual(pair);
  });
});

describe('map-scoped keys', () => {
  it('scopes regions-map answers to their map and leaves other answers alone', () => {
    expect(answerKey({ map: 'ca' }, 'NL')).toBe('ca:NL');
    expect(answerKey({}, 'Netherlands')).toBe('Netherlands');
    expect(parseMapKey('ca:NL')).toEqual({ map: 'ca', code: 'NL' });
    expect(parseMapKey('NL')).toBeUndefined();
    expect(isMapKey('ca:NL')).toBe(true);
    // old unscoped confusions and plain answers stay plain
    expect(isMapKey('NL')).toBe(false);
    expect(isMapKey('ddd:br:pattern')).toBe(false);
    expect(parsePairKey(pairKey({ picked: 'ca:PE', truth: 'ca:NL' }))).toEqual({
      picked: 'ca:PE',
      truth: 'ca:NL',
    });
  });
});

describe('recordAnswer', () => {
  it('ignores correct answers', () => {
    const confusions = missTimes(1);
    expect(recordAnswer(confusions, 'BG', 'BG', true, now)).toBe(confusions);
  });

  it('never moves lastSeen backwards when called out of order', () => {
    const later = recordAnswer([], 'BG', 'RS', false, now);
    const result = recordAnswer(later, 'BG', 'RS', false, daysAgo(2));
    expect(result[0]?.lastSeen).toBe(now.toISOString());
    expect(result[0]?.count).toBe(2);
  });

  it('inserts then increments a directed pair', () => {
    const confusions = recordAnswer(missTimes(2), 'BG', 'RS', false, now);
    expect(confusions).toEqual([
      { picked: 'RS', truth: 'BG', count: 2, lastSeen: now.toISOString(), contrastStreak: 0 },
      { picked: 'BG', truth: 'RS', count: 1, lastSeen: now.toISOString(), contrastStreak: 0 },
    ]);
  });

  it('restarts the count when the last miss is older than 14 days', () => {
    const stale = missTimes(4, daysAgo(15));
    expect(recordAnswer(stale, 'RS', 'BG', false, now)[0]?.count).toBe(1);
    const fresh = missTimes(4, daysAgo(14));
    expect(recordAnswer(fresh, 'RS', 'BG', false, now)[0]?.count).toBe(5);
  });

  it('a new miss breaks a contrast streak', () => {
    const streaking = contrastResult(missTimes(3), pair, true);
    expect(recordAnswer(streaking, 'RS', 'BG', false, now)[0]?.contrastStreak).toBe(0);
  });
});

describe('activePairs', () => {
  it('needs at least 3 misses', () => {
    expect(activePairs(missTimes(2), now)).toEqual([]);
    expect(activePairs(missTimes(3), now)).toHaveLength(1);
  });

  it('drops pairs whose last miss is outside 14 days', () => {
    expect(activePairs(missTimes(3, daysAgo(14)), now)).toHaveLength(1);
    expect(activePairs(missTimes(3, daysAgo(15)), now)).toEqual([]);
  });

  it('orders by count', () => {
    const confusions = [
      ...missTimes(3),
      { picked: 'EE', truth: 'LV', count: 6, lastSeen: now.toISOString(), contrastStreak: 0 },
    ];
    expect(activePairs(confusions, now).map((c) => c.truth)).toEqual(['LV', 'BG']);
  });
});

describe('contrastResult', () => {
  const streak = (answers: boolean[]) =>
    answers.reduce((acc, correct) => contrastResult(acc, pair, correct), missTimes(3));

  it('resets the streak on a wrong answer', () => {
    expect(streak([true, true, false])[0]?.contrastStreak).toBe(0);
  });

  it('stays active at 4 in a row and resolves at 5', () => {
    expect(activePairs(streak([true, true, true, true]), now)).toHaveLength(1);
    const resolved = streak([true, true, true, true, true]);
    expect(resolved[0]).toMatchObject({ contrastStreak: 5, count: 0 });
    expect(activePairs(resolved, now)).toEqual([]);
  });

  it('a resolved pair needs 3 fresh misses to return', () => {
    let confusions = streak([true, true, true, true, true]);
    confusions = recordAnswer(confusions, 'RS', 'BG', false, now);
    confusions = recordAnswer(confusions, 'RS', 'BG', false, now);
    expect(activePairs(confusions, now)).toEqual([]);
    confusions = recordAnswer(confusions, 'RS', 'BG', false, now);
    expect(activePairs(confusions, now)).toHaveLength(1);
  });

  it('leaves other pairs untouched', () => {
    const other: Confusion = {
      picked: 'EE',
      truth: 'LV',
      count: 3,
      lastSeen: now.toISOString(),
      contrastStreak: 2,
    };
    expect(contrastResult([other], pair, true)).toEqual([other]);
  });
});
