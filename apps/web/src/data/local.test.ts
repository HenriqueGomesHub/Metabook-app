import 'fake-indexeddb/auto';
import { DEFAULT_SETTINGS } from '@metabook/core';
import type { Card, CardState, Round, Snapshot, Tip, TrainingBlock } from '@metabook/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { mergeOverrides } from './content';
import type { Content } from './content';
import { LocalRepository } from './local';

let dbCount = 0;
let repo: LocalRepository;

beforeEach(() => {
  repo = new LocalRepository(`test-${dbCount++}`);
});

const state = (cardId: string, due: string): CardState => ({
  cardId,
  due,
  stability: 2.5,
  difficulty: 5,
  elapsedDays: 0,
  scheduledDays: 3,
  reps: 1,
  lapses: 0,
  state: 'review',
});

const snapshot: Snapshot = {
  takenAt: '2026-11-01T00:00:00.000Z',
  perCountry: {},
  topConfusions: [],
};

const card = (id: string, answer: string): Card => ({
  id,
  type: 'flag',
  country: 'LT',
  answer,
  prompt: { kind: 'flag', value: 'LT' },
  tags: [],
  source: 'https://example.com',
});

const tip = (id: string, text: string): Tip => ({
  id,
  answer: 'Lithuania',
  scope: 'any',
  text,
  source: 'https://example.com',
});

describe('LocalRepository', () => {
  it('returns default settings, then saved settings', async () => {
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
    await repo.saveSettings({ ...DEFAULT_SETTINGS, newPerDay: 5 });
    expect((await repo.getSettings()).newPerDay).toBe(5);
  });

  it('upserts card states by card id', async () => {
    await repo.upsertCardStates([
      state('flag:lt', '2026-11-02T00:00:00.000Z'),
      state('flag:lv', '2026-11-03T00:00:00.000Z'),
    ]);
    await repo.upsertCardStates([state('flag:lt', '2026-11-09T00:00:00.000Z')]);
    const states = await repo.listCardStates();
    expect(states).toHaveLength(2);
    expect(states.find((s) => s.cardId === 'flag:lt')?.due).toBe('2026-11-09T00:00:00.000Z');
  });

  it('lists reviews since a date, oldest first', async () => {
    const review = (id: string, reviewedAt: string) => ({
      id,
      cardId: 'flag:lt',
      grade: 'good' as const,
      answerGiven: 'Lithuania',
      correct: true,
      usedHint: false,
      msTaken: 1200,
      reviewedAt,
    });
    await repo.addReview(review('b', '2026-11-05T10:00:00.000Z'));
    await repo.addReview(review('a', '2026-11-01T10:00:00.000Z'));
    expect((await repo.listReviews()).map((r) => r.id)).toEqual(['a', 'b']);
    expect((await repo.listReviews('2026-11-03T00:00:00.000Z')).map((r) => r.id)).toEqual(['b']);
  });

  it('upserts confusions by picked and truth', async () => {
    const confusion = {
      picked: 'EE',
      truth: 'LV',
      count: 1,
      lastSeen: '2026-11-01T00:00:00.000Z',
      contrastStreak: 0,
    };
    await repo.upsertConfusions([confusion]);
    await repo.upsertConfusions([
      { ...confusion, count: 2 },
      { ...confusion, truth: 'LT' },
    ]);
    const stored = await repo.listConfusions();
    expect(stored).toHaveLength(2);
    expect(stored.find((c) => c.truth === 'LV')?.count).toBe(2);
  });

  it('records the latest tip view', async () => {
    await repo.recordTipView({ tipId: 't1', lastShown: '2026-11-01T00:00:00.000Z' });
    await repo.recordTipView({ tipId: 't1', lastShown: '2026-11-02T00:00:00.000Z' });
    expect(await repo.listTipViews()).toEqual([
      { tipId: 't1', lastShown: '2026-11-02T00:00:00.000Z' },
    ]);
  });

  it('lists rounds newest first and overwrites duplicates', async () => {
    const round = (id: string, playedAt: string): Round => ({
      id,
      source: 'manual',
      playedAt,
      truth: { country: 'BR' },
      guess: { country: 'AR' },
    });
    await repo.addRounds([
      round('r1', '2026-11-01T00:00:00.000Z'),
      round('r2', '2026-11-02T00:00:00.000Z'),
    ]);
    await repo.addRounds([{ ...round('r1', '2026-11-01T00:00:00.000Z'), map: 'World' }]);
    const rounds = await repo.listRounds();
    expect(rounds.map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(rounds[1]?.map).toBe('World');
  });

  it('saves blocks and lists block days per block', async () => {
    const block: TrainingBlock = {
      id: 'b1',
      startsOn: '2026-11-01',
      endsOn: '2026-11-15',
      minutesPerDay: 20,
      targets: [{ kind: 'country', key: 'BR' }],
      baseline: snapshot,
      status: 'active',
    };
    await repo.saveBlock(block);
    await repo.saveBlock({ ...block, status: 'finished', final: snapshot });
    await repo.upsertBlockDay({ blockId: 'b1', day: '2026-11-01', minutesDone: 10, cardsDone: 30 });
    await repo.upsertBlockDay({ blockId: 'b1', day: '2026-11-01', minutesDone: 20, cardsDone: 60 });
    await repo.upsertBlockDay({ blockId: 'b2', day: '2026-11-01', minutesDone: 5, cardsDone: 5 });
    expect(await repo.listBlocks()).toEqual([{ ...block, status: 'finished', final: snapshot }]);
    expect(await repo.listBlockDays('b1')).toEqual([
      { blockId: 'b1', day: '2026-11-01', minutesDone: 20, cardsDone: 60 },
    ]);
  });

  it('saves and deletes overrides', async () => {
    await repo.saveCardOverride({
      id: 'flag:lt',
      kind: 'card',
      data: card('flag:lt', 'Lithuania'),
    });
    await repo.saveCardOverride({ id: 'tip:1', kind: 'tip', data: tip('tip:1', 'new') });
    expect(await repo.listCardOverrides()).toHaveLength(2);
    await repo.deleteCardOverride('flag:lt');
    expect((await repo.listCardOverrides()).map((o) => o.id)).toEqual(['tip:1']);
  });

  it('has no pairing in local mode', async () => {
    expect(await repo.getPairing()).toBeNull();
    expect(await repo.createPairingCode()).toBeNull();
  });
});

describe('mergeOverrides', () => {
  const base: Content = {
    pool: [],
    chapters: [],
    cards: [card('flag:lt', 'Lithuania'), card('flag:lv', 'Latvia')],
    tips: [tip('tip:1', 'bundled')],
  };

  it('lets overrides win by id and appends new ids', () => {
    const merged = mergeOverrides(base, [
      { id: 'flag:lt', kind: 'card', data: card('flag:lt', 'Litva') },
      { id: 'flag:ee', kind: 'card', data: card('flag:ee', 'Estonia') },
      { id: 'tip:1', kind: 'tip', data: tip('tip:1', 'edited') },
    ]);
    expect(merged.cards.map((c) => [c.id, c.answer])).toEqual([
      ['flag:lt', 'Litva'],
      ['flag:lv', 'Latvia'],
      ['flag:ee', 'Estonia'],
    ]);
    expect(merged.tips.map((t) => t.text)).toEqual(['edited']);
  });

  it('returns the base content when there are no overrides', () => {
    expect(mergeOverrides(base, [])).toEqual(base);
  });
});
