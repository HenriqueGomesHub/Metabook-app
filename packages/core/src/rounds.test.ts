import { describe, expect, it } from 'vitest';
import { ingestRounds, snapshot } from './rounds';
import type { Card, CardState, Review, Round } from './types';

const now = new Date('2026-03-15T12:00:00Z');
const since = new Date('2026-03-01T00:00:00Z');

const card = (id: string, country: string, answer = country): Card => ({
  id,
  type: 'flag',
  country,
  answer,
  prompt: { kind: 'text', value: id },
  tags: [],
  source: 'https://example.org',
});

const reviewed = (cardId: string, lastReview: string): CardState => ({
  cardId,
  due: '2026-04-30T00:00:00Z',
  stability: 10,
  difficulty: 5,
  elapsedDays: 0,
  scheduledDays: 30,
  reps: 3,
  lapses: 0,
  state: 'review',
  lastReview,
});

let roundId = 0;
const round = (
  truth: string,
  guess: string,
  distanceKm?: number,
  playedAt = '2026-03-10T00:00:00Z',
): Round => ({
  id: `r${roundId++}`,
  source: 'manual',
  playedAt,
  truth: { country: truth },
  guess: { country: guess },
  distanceKm,
});

describe('ingestRounds', () => {
  const rsCards = Array.from({ length: 7 }, (_, i) => card(`rs${i}`, 'RS'));
  const states: Record<string, CardState> = Object.fromEntries(
    rsCards.slice(0, 6).map((c, i) => [c.id, reviewed(c.id, `2026-03-0${i + 1}T00:00:00Z`)]),
  );

  it('upserts confusions dated at play time and pulls the 5 weakest seen cards forward', () => {
    const rounds = [
      round('RS', 'BG'),
      round('RS', 'BG', undefined, '2026-03-12T00:00:00Z'),
      round('BR', 'BR'),
    ];
    const result = ingestRounds(rounds, [], states, { RS: rsCards }, now);

    expect(result.confusions).toEqual([
      {
        picked: 'BG',
        truth: 'RS',
        count: 2,
        lastSeen: '2026-03-12T00:00:00.000Z',
        contrastStreak: 0,
      },
    ]);
    expect(result.summary).toEqual({
      rounds: 3,
      misses: 2,
      pulledForward: ['rs0', 'rs1', 'rs2', 'rs3', 'rs4'],
    });
    expect(result.states.rs0?.due).toBe(now.toISOString());
    expect(result.states.rs5?.due).toBe(states.rs5?.due);
    expect(result.states.rs6).toBeUndefined();
    expect(states.rs0?.due).toBe('2026-04-30T00:00:00Z');
  });

  it('changes nothing when every guess is right', () => {
    const result = ingestRounds([round('RS', 'RS')], [], states, { RS: rsCards }, now);
    expect(result).toEqual({
      confusions: [],
      states,
      summary: { rounds: 1, misses: 0, pulledForward: [] },
    });
  });
});

describe('ingestRounds confusion keys', () => {
  it('keys by flag-card answer so round and drill confusions merge', () => {
    const byCountry = {
      LV: [card('flag:lv', 'LV', 'Latvia')],
      LT: [card('flag:lt', 'LT', 'Lithuania')],
    };
    const drill = [
      {
        picked: 'Latvia',
        truth: 'Lithuania',
        count: 2,
        lastSeen: '2026-03-10T00:00:00.000Z',
        contrastStreak: 0,
      },
    ];
    const result = ingestRounds([round('LT', 'LV')], drill, {}, byCountry, now);
    expect(result.confusions).toHaveLength(1);
    expect(result.confusions[0]).toMatchObject({ picked: 'Latvia', truth: 'Lithuania', count: 3 });
  });
});

describe('ingestRounds ordering and duplicates', () => {
  const day = (d: number) => `2026-03-0${d}T00:00:00Z`;
  const rounds = [
    round('RS', 'BG', 1, day(1)),
    round('RS', 'BG', 1, day(5)),
    round('RS', 'BG', 1, day(3)),
  ];

  it('gives the same result for newest-first input as chronological input', () => {
    const chronological = [...rounds].sort((a, b) => a.playedAt.localeCompare(b.playedAt));
    const newestFirst = [...chronological].reverse();
    expect(ingestRounds(newestFirst, [], {}, {}, now)).toEqual(
      ingestRounds(chronological, [], {}, {}, now),
    );
    expect(ingestRounds(newestFirst, [], {}, {}, now).confusions[0]?.lastSeen).toBe(
      '2026-03-05T00:00:00.000Z',
    );
  });

  it('ignores round ids already ingested and repeated within the batch', () => {
    const seenIds = new Set([rounds[0]?.id ?? '']);
    const result = ingestRounds([...rounds, ...rounds], [], {}, {}, now, seenIds);
    expect(result.summary).toMatchObject({ rounds: 2, misses: 2 });
    expect(result.confusions[0]?.count).toBe(2);
  });
});

describe('snapshot', () => {
  const cards = [card('flag:rs', 'RS', 'Serbia'), card('flag:pe', 'PE', 'Peru')];
  const review = (
    cardId: string,
    correct: boolean,
    answerGiven: string,
    reviewedAt = '2026-03-10T00:00:00Z',
  ): Review => ({
    id: `${cardId}-${reviewedAt}-${answerGiven}`,
    cardId,
    grade: correct ? 'good' : 'again',
    answerGiven,
    correct,
    usedHint: false,
    msTaken: 4000,
    reviewedAt,
  });

  it('normalizes drill confusion keys so typos in case do not split pairs', () => {
    const reviews = [
      review('flag:pe', false, 'Bolivia'),
      review('flag:pe', false, ' bolivia ', '2026-03-11T00:00:00Z'),
      review('flag:pe', false, 'BOLÍVIA', '2026-03-12T00:00:00Z'),
    ];
    const snap = snapshot([], reviews, cards, since, now);
    expect(snap.topConfusions).toEqual([{ picked: 'bolivia', truth: 'Peru', count: 3 }]);
  });

  it('maps a drill answer to the matching card answer', () => {
    const reviews = [review('flag:pe', false, 'serbia'), review('flag:pe', false, 'SERBIA')];
    const snap = snapshot([], reviews, cards, since, now);
    expect(snap.topConfusions).toEqual([{ picked: 'Serbia', truth: 'Peru', count: 2 }]);
  });

  it('uses rounds per country where present, else reviews, within the window', () => {
    const rounds = [
      round('RS', 'RS', 100),
      round('RS', 'BG', 300),
      round('RS', 'BG'),
      round('RS', 'RS', 50, '2026-02-01T00:00:00Z'),
    ];
    const reviews = [
      review('flag:rs', true, 'Serbia'),
      review('flag:pe', true, 'Peru'),
      review('flag:pe', false, 'Bolivia'),
      review('flag:pe', false, 'Bolivia', '2026-03-16T00:00:00Z'),
    ];
    const snap = snapshot(rounds, reviews, cards, since, now);
    expect(snap.takenAt).toBe(now.toISOString());
    expect(snap.perCountry).toEqual({
      RS: { accuracy: 1 / 3, rounds: 3, avgDistanceKm: 200 },
      PE: { accuracy: 0.5, rounds: 2 },
    });
    expect(snap.avgDistanceKm).toBe(200);
    expect(snap.topConfusions).toEqual([
      { picked: 'BG', truth: 'Serbia', count: 2 },
      { picked: 'bolivia', truth: 'Peru', count: 1 },
    ]);
  });

  it('merges a round confusion (LV to LT) with the drill confusion (Latvia to Lithuania)', () => {
    const named = [card('flag:lv', 'LV', 'Latvia'), card('flag:lt', 'LT', 'Lithuania')];
    const snap = snapshot(
      [round('LT', 'LV')],
      [review('flag:lt', false, 'Latvia')],
      named,
      since,
      now,
    );
    expect(snap.topConfusions).toEqual([{ picked: 'Latvia', truth: 'Lithuania', count: 2 }]);
  });

  it('is empty without data', () => {
    expect(snapshot([], [], cards, since, now)).toEqual({
      takenAt: now.toISOString(),
      perCountry: {},
      topConfusions: [],
    });
  });
});
