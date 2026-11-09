import { describe, expect, it } from 'vitest';
import { blockProgress, compareBlocks, matchesTarget, planBlock, suggestMaps } from './blocks';
import { DEFAULT_SETTINGS, type BlockDay, type Card, type Snapshot } from './types';

const now = new Date(2026, 2, 10, 9, 30);

const baseline: Snapshot = {
  takenAt: now.toISOString(),
  perCountry: {
    RS: { accuracy: 0.3, rounds: 10 },
    BG: { accuracy: 0.3, rounds: 12 },
    PE: { accuracy: 0.1, rounds: 2 },
    EE: { accuracy: 0.5, rounds: 3 },
    LV: { accuracy: 0.6, rounds: 8 },
    BR: { accuracy: 0.9, rounds: 20 },
  },
  topConfusions: [
    { picked: 'BG', truth: 'RS', count: 4 },
    { picked: 'LV', truth: 'EE', count: 3 },
    { picked: 'AR', truth: 'UY', count: 1 },
  ],
};

describe('planBlock', () => {
  it('targets the 3 weakest countries with enough data and the top 2 pairs', () => {
    const block = planBlock({ snapshot: baseline, settings: DEFAULT_SETTINGS, now });
    expect(block).toMatchObject({
      startsOn: '2026-03-10',
      endsOn: '2026-03-23',
      minutesPerDay: 20,
      status: 'active',
      baseline,
      targets: [
        { kind: 'country', key: 'BG' },
        { kind: 'country', key: 'RS' },
        { kind: 'country', key: 'EE' },
        { kind: 'pair', key: 'BG|RS' },
        { kind: 'pair', key: 'LV|EE' },
      ],
    });
  });

  it('clamps length to 7–30 days and minutes to 10–60', () => {
    const short = planBlock({
      snapshot: baseline,
      settings: DEFAULT_SETTINGS,
      now,
      days: 3,
      minutes: 5,
    });
    expect(short).toMatchObject({ endsOn: '2026-03-16', minutesPerDay: 10 });
    const long = planBlock({
      snapshot: baseline,
      settings: DEFAULT_SETTINGS,
      now,
      days: 90,
      minutes: 90,
    });
    expect(long).toMatchObject({ endsOn: '2026-04-08', minutesPerDay: 60 });
  });
});

describe('blockProgress', () => {
  const block = planBlock({ snapshot: baseline, settings: DEFAULT_SETTINGS, now, days: 7 });
  const day = (d: string, minutesDone: number): BlockDay => ({
    blockId: block.id,
    day: d,
    minutesDone,
    cardsDone: minutesDone,
  });

  it('starts at day 0 with nothing missed', () => {
    expect(blockProgress(block, [], now)).toEqual({
      dayIndex: 0,
      totalDays: 7,
      todayMinutes: 0,
      missedDays: 0,
      finished: false,
    });
  });

  it('counts past days without practice as missed and reads today', () => {
    const days = [day('2026-03-10', 20), day('2026-03-11', 0), day('2026-03-13', 15)];
    expect(blockProgress(block, days, new Date(2026, 2, 13, 22))).toEqual({
      dayIndex: 3,
      totalDays: 7,
      todayMinutes: 15,
      missedDays: 2,
      finished: false,
    });
  });

  it('finishes after the last day, clamping the index', () => {
    const progress = blockProgress(block, [], new Date(2026, 2, 20, 8));
    expect(progress).toMatchObject({ dayIndex: 6, missedDays: 7, finished: true });
    expect(blockProgress(block, [], new Date(2026, 2, 16, 23)).finished).toBe(false);
  });

  it('is finished once ended early', () => {
    expect(blockProgress({ ...block, status: 'ended-early' }, [], now).finished).toBe(true);
  });
});

describe('compareBlocks', () => {
  it('reports accuracy deltas for countries and miss counts for pairs', () => {
    const final: Snapshot = {
      takenAt: now.toISOString(),
      perCountry: { RS: { accuracy: 0.7, rounds: 10 } },
      topConfusions: [{ picked: 'BG', truth: 'RS', count: 1 }],
    };
    const targets = [
      { kind: 'country', key: 'RS' },
      { kind: 'country', key: 'EE' },
      { kind: 'pair', key: 'BG|RS' },
    ] as const;
    expect(compareBlocks([...targets], baseline, final)).toEqual([
      { target: targets[0], before: 0.3, after: 0.7, delta: expect.closeTo(0.4) },
      { target: targets[1], before: 0.5, after: null, delta: null },
      { target: targets[2], before: 4, after: 1, delta: -3 },
    ]);
  });
});

describe('compareBlocks pair absent from final', () => {
  it('treats a pair missing from the final snapshot as 0 misses', () => {
    const final: Snapshot = { takenAt: now.toISOString(), perCountry: {}, topConfusions: [] };
    const target = { kind: 'pair', key: 'BG|RS' } as const;
    expect(compareBlocks([target], baseline, final)).toEqual([
      { target, before: 4, after: 0, delta: -4 },
    ]);
  });
});

describe('suggestMaps', () => {
  it('names countries from ISO codes and keeps other keys as given', () => {
    expect(
      suggestMaps([
        { kind: 'country', key: 'RS' },
        { kind: 'pair', key: 'BG|RS' },
        { kind: 'pair', key: 'Latvia|Estonia' },
        { kind: 'chapter', key: 'br:regions' },
      ]),
    ).toEqual([
      'Play a map focused on Serbia',
      'Play a map focused on Serbia and Bulgaria',
      'Play a map focused on Estonia and Latvia',
    ]);
  });
});

describe('matchesTarget', () => {
  const card: Card = {
    id: 'flag:rs',
    type: 'flag',
    country: 'RS',
    answer: 'Serbia',
    prompt: { kind: 'flag', value: 'rs' },
    tags: [],
    chapter: 'rs:flags',
    source: 'https://example.org',
  };

  it('matches by country, chapter, or either side of a pair (code or answer)', () => {
    expect(matchesTarget(card, { kind: 'country', key: 'RS' })).toBe(true);
    expect(matchesTarget(card, { kind: 'country', key: 'BG' })).toBe(false);
    expect(matchesTarget(card, { kind: 'chapter', key: 'rs:flags' })).toBe(true);
    expect(matchesTarget(card, { kind: 'pair', key: 'BG|RS' })).toBe(true);
    expect(matchesTarget(card, { kind: 'pair', key: 'Serbia|Bulgaria' })).toBe(true);
    expect(matchesTarget(card, { kind: 'pair', key: 'LV|EE' })).toBe(false);
  });

  it('matches map-scoped pairs only to cards on that map', () => {
    const where: Card = {
      ...card,
      id: 'gen:ca:where:x',
      type: 'region',
      country: 'CA',
      answer: 'NL',
      map: 'ca',
    };
    const flag: Card = { ...card, id: 'flag:nl', country: 'NL', answer: 'Netherlands' };
    expect(matchesTarget(where, { kind: 'pair', key: 'ca:PE|ca:NL' })).toBe(true);
    expect(matchesTarget(flag, { kind: 'pair', key: 'ca:PE|ca:NL' })).toBe(false);
    expect(matchesTarget(where, { kind: 'pair', key: 'PE|NL' })).toBe(false);
  });
});
