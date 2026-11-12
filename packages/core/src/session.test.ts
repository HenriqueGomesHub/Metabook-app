import { describe, expect, it } from 'vitest';
import { answerKey, recordAnswer } from './confusions';
import { mulberry32 } from './random';
import { retrievability } from './scheduler';
import {
  buildSession,
  intakeFor,
  newCardSeconds,
  modeFor,
  requeueMissed,
  scanCardSeconds,
  reviewSecondsFrom,
  type SessionItem,
} from './session';
import {
  DEFAULT_SETTINGS,
  type Card,
  type CardState,
  type CardType,
  type Confusion,
  type TrainingBlock,
} from './types';

const now = new Date('2026-03-15T12:00:00Z');
const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000).toISOString();

const card = (id: string, type: CardType = 'flag', country = 'BR', answer = id): Card => ({
  id,
  type,
  country,
  answer,
  prompt: { kind: 'text', value: id },
  tags: [],
  source: 'https://example.org',
});

const seen = (cardId: string, due: string, reps = 5): CardState => ({
  cardId,
  due,
  stability: 10,
  difficulty: 5,
  elapsedDays: 10,
  scheduledDays: 10,
  reps,
  lapses: 0,
  state: 'review',
  lastReview: '2026-03-01T12:00:00Z',
});

const settings = { ...DEFAULT_SETTINGS, maxReviewsPerDay: 10, newPerDay: 5 };
const baseSettings = settings;
const rng = () => mulberry32(42);
const typeById = (cards: Card[]) => new Map(cards.map((c) => [c.id, c.type]));

function longestRun(queue: SessionItem[], types: Map<string, CardType>): number {
  let longest = 0;
  let run = 0;
  queue.forEach((item, i) => {
    run = i > 0 && types.get(item.cardId) === types.get(queue[i - 1]?.cardId ?? '') ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return longest;
}

function deck(dueCount: number, newCount: number, types: CardType[] = ['flag', 'script', 'meta']) {
  const cards: Card[] = [];
  const states: Record<string, CardState> = {};
  for (let i = 0; i < dueCount; i++) {
    const c = card(`due${i}`, types[i % types.length]);
    cards.push(c);
    states[c.id] = seen(c.id, minutesAgo(1000 - i));
  }
  for (let i = 0; i < newCount; i++) cards.push(card(`new${i}`, types[i % types.length]));
  return { cards, states };
}

describe('buildSession', () => {
  it('takes due reviews and new cards up to their caps, skipping cards not yet due', () => {
    const { cards, states } = deck(4, 8);
    cards.push(card('later', 'flag'));
    states.later = seen('later', '2026-03-20T00:00:00Z');
    const session = buildSession({ cards, states, confusions: [], settings, now, rng: rng() });
    const ids = session.queue.map((i) => i.cardId);
    expect(ids.filter((id) => id.startsWith('due'))).toHaveLength(4);
    expect(ids.filter((id) => id.startsWith('new'))).toHaveLength(5);
    expect(ids).not.toContain('later');
    expect(session).toMatchObject({ catchUp: false, remaining: 0 });
  });

  it('takes new cards round-robin across types, stable within a type', () => {
    const cards = [
      ...['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id) => card(id, 'flag')),
      ...['b1', 'b2', 'b3'].map((id) => card(id, 'script')),
      ...['c1', 'c2', 'c3'].map((id) => card(id, 'meta')),
    ];
    const queue = buildSession({
      cards,
      states: {},
      confusions: [],
      settings: { ...settings, newPerDay: 6 },
      now,
      rng: rng(),
    }).queue;
    const ids = queue.map((i) => i.cardId);
    expect(ids.filter((id) => id.startsWith('a')).sort()).toEqual(['a1', 'a2']);
    expect(ids.filter((id) => id.startsWith('b')).sort()).toEqual(['b1', 'b2']);
    expect(ids.filter((id) => id.startsWith('c')).sort()).toEqual(['c1', 'c2']);
  });

  it('lowers the caps by what was already done today', () => {
    const { cards, states } = deck(12, 8);
    const queue = buildSession({
      cards,
      states,
      confusions: [],
      settings,
      doneToday: { reviews: 4, newCards: 3 },
      now,
      rng: rng(),
    }).queue.map((i) => i.cardId);
    expect(queue.filter((id) => id.startsWith('due'))).toHaveLength(6);
    expect(queue.filter((id) => id.startsWith('new'))).toHaveLength(2);
  });

  it('keeps the reviews most at risk of being forgotten when over the cap', () => {
    const { cards, states } = deck(25, 0);
    const session = buildSession({ cards, states, confusions: [], settings, now, rng: rng() });
    const kept = session.queue.map((i) => i.cardId);
    expect(kept).toHaveLength(10);
    // equal value: the lowest recall, i.e. the most overdue, go first
    const recall = (id: string) => retrievability(states[id] as CardState, now);
    const worstLeftOut = Math.min(
      ...cards.filter((c) => !kept.includes(c.id)).map((c) => recall(c.id)),
    );
    for (const id of kept) expect(recall(id)).toBeLessThanOrEqual(worstLeftOut + 1e-9);
    expect(session).toMatchObject({ catchUp: false, remaining: 15 });
  });

  it('fits the session in its time box, most valuable reviews first', () => {
    const { cards, states } = deck(200, 0);
    const session = buildSession({
      cards,
      states,
      confusions: [],
      settings: { ...settings, maxReviewsPerDay: 500, sessionMinutes: 5 },
      now,
      rng: rng(),
    });
    // about 5 minutes of 8-22 s reviews
    expect(session.queue.length).toBeGreaterThan(10);
    expect(session.queue.length).toBeLessThan(40);
    expect(session.remaining).toBeGreaterThan(150);
  });

  it('enters catch-up only when overdue exceeds 3× the cap', () => {
    const atLimit = deck(30, 0);
    expect(buildSession({ ...atLimit, confusions: [], settings, now }).catchUp).toBe(false);
    const over = deck(31, 0);
    const session = buildSession({ ...over, confusions: [], settings, now });
    expect(session).toMatchObject({ catchUp: true, remaining: 21 });
    expect(session.queue).toHaveLength(10);
  });

  it('spreads new cards at about 30% through the queue', () => {
    const { cards, states } = deck(14, 6);
    const queue = buildSession({
      cards,
      states,
      confusions: [],
      settings: { ...settings, maxReviewsPerDay: 20, newPerDay: 6 },
      now,
      rng: rng(),
    }).queue;
    const firstTen = queue.slice(0, 10).filter((i) => i.cardId.startsWith('new')).length;
    expect(firstTen).toBeGreaterThanOrEqual(2);
    expect(firstTen).toBeLessThanOrEqual(4);
  });

  it('never runs more than 3 of a type when another type is available', () => {
    const { cards, states } = deck(16, 0, ['flag', 'flag', 'flag', 'script']);
    const queue = buildSession({
      cards,
      states,
      confusions: [],
      settings: { ...settings, maxReviewsPerDay: 50 },
      now,
      rng: rng(),
    }).queue;
    expect(queue).toHaveLength(16);
    expect(longestRun(queue, typeById(cards))).toBeLessThanOrEqual(3);
  });

  it('holds the interleave cap at the feasibility edge (12 flags, 3 scripts)', () => {
    const cards = [
      ...Array.from({ length: 3 }, (_, i) => card(`s${i}`, 'script')),
      ...Array.from({ length: 12 }, (_, i) => card(`f${i}`, 'flag')),
    ];
    const states = Object.fromEntries(cards.map((c, i) => [c.id, seen(c.id, minutesAgo(100 - i))]));
    for (let seed = 0; seed < 20; seed++) {
      const queue = buildSession({
        cards,
        states,
        confusions: [],
        settings: { ...settings, maxReviewsPerDay: 50 },
        now,
        rng: mulberry32(seed),
      }).queue;
      expect(longestRun(queue, typeById(cards))).toBeLessThanOrEqual(3);
    }
  });

  it('still returns every card when a single type makes the cap impossible', () => {
    const { cards, states } = deck(6, 0, ['flag']);
    expect(buildSession({ cards, states, confusions: [], settings, now }).queue).toHaveLength(6);
  });

  it('uses MCQ for the first 2 reviews, then recall, map for area codes, binary for lookalikes', () => {
    const cards = [
      card('flag-new', 'flag'),
      card('flag-1', 'flag'),
      card('flag-2', 'flag'),
      card('region-2', 'region'),
      card('script-2', 'script'),
      card('ddd-2', 'areacode'),
      card('meta-9', 'meta'),
      card('look-0', 'lookalike'),
    ];
    const states: Record<string, CardState> = {};
    for (const [id, reps] of [
      ['flag-1', 1],
      ['flag-2', 2],
      ['region-2', 2],
      ['script-2', 2],
      ['ddd-2', 2],
      ['meta-9', 9],
    ] as const) {
      states[id] = seen(id, minutesAgo(5), reps);
    }
    const modes = Object.fromEntries(
      buildSession({ cards, states, confusions: [], settings, now }).queue.map((i) => [
        i.cardId,
        i.mode,
      ]),
    );
    expect(modes).toEqual({
      'flag-new': 'mcq',
      'flag-1': 'mcq',
      'flag-2': 'recall',
      'region-2': 'recall',
      'script-2': 'recall',
      'ddd-2': 'map',
      'meta-9': 'mcq',
      'look-0': 'binary',
    });
  });

  it('is deterministic for a given seed', () => {
    const { cards, states } = deck(10, 5);
    const build = (seed: number) =>
      buildSession({ cards, states, confusions: [], settings, now, rng: mulberry32(seed) }).queue;
    expect(build(7)).toEqual(build(7));
    expect(build(7)).not.toEqual(build(8));
  });

  it('draws new cards from the curriculum: active countries, siblings apart, same all day', () => {
    const clueCard = (country: string, clue: string, type: CardType, n = 0): Card => ({
      ...card(`clue:${clue}:${type}:${n}`, type, country),
      subject: 'bollard',
      clue: { id: clue },
    });
    const cards = ['FR', 'US', 'BR', 'JP', 'RU', 'CA'].flatMap((code) =>
      [1, 2, 3].flatMap((i) => [
        clueCard(code, `${code}-${i}`, 'spot'),
        clueCard(code, `${code}-${i}`, 'spot', 1),
        clueCard(code, `${code}-${i}`, 'which'),
      ]),
    );
    const morning = new Date(2026, 2, 15, 8);
    const evening = new Date(2026, 2, 15, 20);
    const build = (at: Date, introducedToday: string[] = []) =>
      buildSession({
        cards,
        states: {},
        confusions: [],
        settings: { ...settings, newPerDay: 12 },
        introducedToday,
        now: at,
      }).queue.map((i) => i.cardId);
    const queue = build(morning);
    const byId = new Map(cards.map((c) => [c.id, c]));
    expect(new Set(queue.map((id) => byId.get(id)?.country))).toEqual(
      new Set(['US', 'BR', 'RU', 'CA']),
    );
    queue.forEach((id, i) => {
      if (i > 0) expect(byId.get(id)?.clue?.id).not.toBe(byId.get(queue[i - 1]!)?.clue?.id);
    });
    // no reshuffle on reload during the day
    expect(build(evening)).toEqual(queue);
    // a clue with two cards introduced today gets no third
    const twice = build(morning, ['clue:US-1:spot:0', 'clue:US-1:which:0']);
    expect(twice.filter((id) => id.startsWith('clue:US-1:'))).toEqual([]);
  });

  describe('training block', () => {
    const block: TrainingBlock = {
      id: 'b1',
      startsOn: '2026-03-10',
      endsOn: '2026-03-23',
      minutesPerDay: 20,
      targets: [{ kind: 'country', key: 'RS' }],
      baseline: { takenAt: '2026-03-10T00:00:00Z', perCountry: {}, topConfusions: [] },
      status: 'active',
    };

    it('tops block targets up to about 40% with the weakest matching cards', () => {
      const { cards, states } = deck(10, 0);
      for (let i = 0; i < 20; i++) {
        const c = card(`rs${i}`, 'flag', 'RS');
        cards.push(c);
        states[c.id] = {
          ...seen(c.id, '2026-03-30T00:00:00Z'),
          lastReview: minutesAgo(60 * 24 * (i + 1)),
        };
      }
      const queue = buildSession({
        cards,
        states,
        confusions: [],
        settings: { ...settings, maxReviewsPerDay: 17 },
        block,
        now,
        rng: rng(),
      }).queue;
      const onTarget = queue.filter((i) => i.cardId.startsWith('rs')).map((i) => i.cardId);
      expect(queue).toHaveLength(17);
      expect(onTarget.length / queue.length).toBeCloseTo(0.4, 1);
      expect(onTarget.sort()).toEqual(Array.from({ length: 7 }, (_, i) => `rs${i + 13}`).sort());
    });

    it('prefers new cards from block targets', () => {
      const cards = [
        ...Array.from({ length: 8 }, (_, i) => card(`br${i}`)),
        card('rs-new', 'flag', 'RS'),
      ];
      const ids = buildSession({
        cards,
        states: {},
        confusions: [],
        settings,
        block,
        now,
      }).queue.map((i) => i.cardId);
      expect(ids).toContain('rs-new');
    });

    it('adds what exists when too few matching cards', () => {
      const { cards, states } = deck(10, 0);
      cards.push(card('rs0', 'flag', 'RS'));
      states.rs0 = seen('rs0', '2026-03-30T00:00:00Z');
      expect(
        buildSession({
          cards,
          states,
          confusions: [],
          settings: { ...settings, maxReviewsPerDay: 11 },
          block,
          now,
        }).queue,
      ).toHaveLength(11);
    });
  });

  describe('contrast questions', () => {
    // ten different Spot it cards a side, so a contrast question is never one already answered
    const sideCards = (code: string, name: string) =>
      Array.from({ length: 10 }, (_, i) => card(`spot:${code}:${i}`, 'spot', code, name));
    const cards = [
      ...sideCards('rs', 'Serbia'),
      ...sideCards('bg', 'Bulgaria'),
      card('flag:ee', 'flag', 'EE', 'Estonia'),
    ];
    // no new cards: the pair's cards are left free for the contrast question
    const settings = { ...baseSettings, newPerDay: 0 };
    const ids = cards.filter((c) => c.answer !== 'Estonia').map((c) => c.id);
    const confusion = (
      count: number,
      contrastStreak = 0,
      lastSeen = now.toISOString(),
    ): Confusion => ({
      picked: 'Serbia',
      truth: 'Bulgaria',
      count,
      lastSeen,
      contrastStreak,
    });
    const contrast = (c: Confusion) =>
      buildSession({ cards, states: {}, confusions: [c], settings, now, rng: rng() }).queue.filter(
        (i) => i.contrastPair,
      );

    it('asks one binary question per confused pair, never a block of them', () => {
      const items = contrast(confusion(3));
      expect(items).toHaveLength(1);
      expect(items[0]?.mode).toBe('binary');
      expect(items[0]?.contrastPair).toEqual(['Serbia', 'Bulgaria']);
      expect(ids).toContain(items[0]?.cardId);
    });

    it('picks a different card of either side from day to day', () => {
      const sides = new Set<string>();
      for (let seed = 1; seed <= 30; seed++) {
        const item = buildSession({
          cards,
          states: {},
          confusions: [confusion(3)],
          settings,
          now,
          rng: mulberry32(seed),
        }).queue.find((i) => i.contrastPair);
        sides.add(item?.cardId ?? '');
      }
      expect([...sides].some((id) => id.startsWith('spot:rs'))).toBe(true);
      expect([...sides].some((id) => id.startsWith('spot:bg'))).toBe(true);
      expect(sides.size).toBeGreaterThan(6);
    });

    it('skips a pair with fewer than ten different cards a side', () => {
      const few = [...sideCards('rs', 'Serbia'), ...sideCards('bg', 'Bulgaria').slice(0, 9)];
      const queue = buildSession({
        cards: few,
        states: {},
        confusions: [confusion(3)],
        settings,
        now,
        rng: rng(),
      }).queue;
      expect(queue.some((i) => i.contrastPair)).toBe(false);
    });

    it('never turns states or area codes into a contrast round', () => {
      // Brazil's area codes answer with bare state codes: Alagoas vs Ceará is a drill, not a daily round
      const codes = [
        ...Array.from({ length: 10 }, (_, i) => card(`ddd:al:${i}`, 'areacode', 'BR', 'AL')),
        ...Array.from({ length: 10 }, (_, i) => card(`ddd:ce:${i}`, 'areacode', 'BR', 'CE')),
      ];
      const queue = buildSession({
        cards: codes,
        states: {},
        confusions: [{ ...confusion(4), picked: 'AL', truth: 'CE' }],
        settings,
        now,
        rng: rng(),
      }).queue;
      expect(queue.some((i) => i.contrastPair)).toBe(false);
    });

    it('spreads contrast questions through the queue, never first or side by side', () => {
      const many = Array.from({ length: 6 }, (_, land) =>
        Array.from({ length: 20 }, (_, i) =>
          card(`f${land}:${i}`, 'spot', `F${land}`, `Land ${land}`),
        ),
      ).flat();
      const pairs: Confusion[] = [0, 2, 4].map((i) => ({
        ...confusion(3),
        picked: `Land ${i}`,
        truth: `Land ${i + 1}`,
      }));
      const queue = buildSession({
        cards: many,
        states: {},
        confusions: pairs,
        settings: baseSettings,
        now,
        rng: rng(),
      }).queue;
      const at = queue.flatMap((item, i) => (item.contrastPair ? [i] : []));
      expect(at).toHaveLength(3);
      expect(at[0]).toBeGreaterThan(0);
      for (let i = 1; i < at.length; i++)
        expect((at[i] as number) - (at[i - 1] as number)).toBeGreaterThan(1);
    });

    it('skips pairs below 3 misses, stale, or resolved', () => {
      expect(contrast(confusion(2))).toEqual([]);
      expect(contrast(confusion(3, 0, '2026-02-01T00:00:00Z'))).toEqual([]);
      expect(contrast(confusion(3, 5))).toEqual([]);
    });

    it('leaves regions-map cards out of contrast rounds', () => {
      const where = (id: string, answer: string) => ({
        ...card(id, 'region', 'US', answer),
        map: 'us',
      });
      const items = buildSession({
        cards: [where('w:tx', 'TX'), where('w:ok', 'OK')],
        states: {},
        confusions: [{ ...confusion(3), picked: 'OK', truth: 'TX' }],
        settings,
        now,
        rng: rng(),
      }).queue;
      expect(items.some((i) => i.contrastPair)).toBe(false);
      expect(items.every((i) => i.mode === 'map')).toBe(true);
    });

    it('never turns a CA where-miss into a flag contrast round (state NL is not the Netherlands)', () => {
      const where = (id: string, answer: string) => ({
        ...card(id, 'region', 'CA', answer),
        map: 'ca',
      });
      const cards = [
        where('gen:ca:where:nl', 'NL'),
        where('gen:ca:where:pe', 'PE'),
        card('flag:nl', 'flag', 'NL', 'Netherlands'),
        card('flag:pe', 'flag', 'PE', 'Peru'),
      ];
      // three misses recorded the way the app records them: picked PEI for Newfoundland
      const miss = cards[0] as Card;
      let confusions: Confusion[] = [];
      for (let i = 0; i < 3; i++) {
        confusions = recordAnswer(
          confusions,
          answerKey(miss, 'PE'),
          answerKey(miss, miss.answer),
          false,
          now,
        );
      }
      expect(confusions).toMatchObject([{ picked: 'ca:PE', truth: 'ca:NL', count: 3 }]);
      const queue = buildSession({
        cards,
        states: {},
        confusions,
        settings,
        now,
        rng: rng(),
      }).queue;
      expect(queue.some((i) => i.contrastPair)).toBe(false);
      expect(queue.filter((i) => i.mode === 'binary')).toEqual([]);
    });

    it('skips a pair whose side has no cards', () => {
      expect(contrast({ ...confusion(3), picked: 'Serbia', truth: 'Nowhere' })).toEqual([]);
    });
  });
});

describe('buildSession catch-up and dedup', () => {
  const localNow = new Date(2026, 2, 15, 12, 0);
  const yesterday = new Date(2026, 2, 14, 23, 0).toISOString();
  const earlierToday = new Date(2026, 2, 15, 8, 0).toISOString();
  const dueDeck = (count: number, due: string) => {
    const cards = Array.from({ length: count }, (_, i) => card(`due${i}`));
    const states = Object.fromEntries(cards.map((c) => [c.id, seen(c.id, due)]));
    return { cards, states };
  };

  it('treats only cards due before the start of today as overdue for catch-up', () => {
    const today = dueDeck(31, earlierToday);
    const session = buildSession({ ...today, confusions: [], settings, now: localNow });
    expect(session.catchUp).toBe(false);
    const past = dueDeck(31, yesterday);
    expect(buildSession({ ...past, confusions: [], settings, now: localNow }).catchUp).toBe(true);
  });

  it('still adds a few new cards in catch-up, so learning never stops', () => {
    const { cards, states } = dueDeck(31, yesterday);
    for (let i = 0; i < 10; i++) cards.push(card(`new${i}`));
    const session = buildSession({ cards, states, confusions: [], settings, now: localNow });
    expect(session.catchUp).toBe(true);
    const fresh = session.queue.filter((i) => i.cardId.startsWith('new'));
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.length).toBeLessThanOrEqual(5);
  });

  it('counts block extras against the daily review cap', () => {
    const { cards, states } = dueDeck(8, earlierToday);
    for (let i = 0; i < 20; i++) {
      const c = card(`rs${i}`, 'flag', 'RS');
      cards.push(c);
      states[c.id] = seen(c.id, '2026-03-30T00:00:00Z');
    }
    const block: TrainingBlock = {
      id: 'b',
      startsOn: '2026-03-10',
      endsOn: '2026-03-23',
      minutesPerDay: 20,
      targets: [{ kind: 'country', key: 'RS' }],
      baseline: { takenAt: '2026-03-10T00:00:00Z', perCountry: {}, topConfusions: [] },
      status: 'active',
    };
    const queue = buildSession({
      cards,
      states,
      confusions: [],
      settings,
      block,
      now: localNow,
    }).queue;
    expect(queue).toHaveLength(10);
  });

  it('does not repeat a contrast-round card in the regular list', () => {
    const cards = ['rs', 'bg'].flatMap((code) =>
      Array.from({ length: 25 }, (_, i) =>
        card(
          `spot:${code}:${i}`,
          'spot',
          code.toUpperCase(),
          code === 'rs' ? 'Serbia' : 'Bulgaria',
        ),
      ),
    );
    const states = Object.fromEntries(cards.map((c) => [c.id, seen(c.id, yesterday)]));
    const confusions: Confusion[] = [
      {
        picked: 'Serbia',
        truth: 'Bulgaria',
        count: 3,
        lastSeen: localNow.toISOString(),
        contrastStreak: 4,
      },
    ];
    const queue = buildSession({ cards, states, confusions, settings, now: localNow }).queue;
    const contrastItem = queue.find((i) => i.contrastPair);
    expect(contrastItem?.contrastPair).toEqual(['Serbia', 'Bulgaria']);
    expect(queue.filter((i) => i.cardId === contrastItem?.cardId)).toHaveLength(1);
  });
});

describe('modeFor', () => {
  it('answers regions-map cards on the map from the first review', () => {
    const where = { ...card('w', 'region', 'US', 'TX'), map: 'us' };
    expect(modeFor(where, undefined)).toBe('map');
    expect(modeFor(where, seen('w', minutesAgo(1), 5))).toBe('map');
    expect(modeFor(card('r', 'region'), undefined)).toBe('mcq');
    expect(modeFor(card('r', 'region'), seen('r', minutesAgo(1), 5))).toBe('recall');
  });
});

describe('requeueMissed', () => {
  it('sends a missed card to the end of the queue, marked as a retry', () => {
    const queue: SessionItem[] = [
      { cardId: 'a', mode: 'mcq' },
      { cardId: 'b', mode: 'mcq' },
    ];
    expect(requeueMissed(queue, queue[0] as SessionItem)).toEqual([
      ...queue,
      { cardId: 'a', mode: 'mcq', retry: true },
    ]);
  });
});

describe('intakeFor', () => {
  it('takes more new cards when most first answers are right', () => {
    expect(intakeFor({ answered: 50, right: 47 })).toBe(3);
    expect(intakeFor({ answered: 50, right: 40 })).toBe(2);
    expect(intakeFor({ answered: 50, right: 20 })).toBe(1);
  });
  it('starts a returning player high until there is a week of answers', () => {
    expect(intakeFor({ answered: 5, right: 5 })).toBe(1);
    expect(intakeFor({ answered: 5, right: 5 }, true)).toBe(3);
  });
});

describe('newCardSeconds', () => {
  it('is short for a learner who already knows most new cards', () => {
    expect(newCardSeconds({ answered: 50, right: 50 })).toBe(5);
    expect(newCardSeconds({ answered: 50, right: 20 })).toBe(16);
    expect(newCardSeconds({ answered: 0, right: 0 }, true)).toBeLessThanOrEqual(10);
  });
});

describe('refresh mode', () => {
  const spot = (id: string, clue: string, country = 'BR'): Card => ({
    ...card(id, 'spot', country, 'Brazil'),
    clue: { id: clue, image: { id: `${id}-img`, src: `https://x/${id}.jpg` } },
  });

  it('shows new photo cards as refreshes, many more than the usual new cards', () => {
    const cards = Array.from({ length: 120 }, (_, i) => spot(`s${i}`, `c${i}`));
    const session = buildSession({
      cards,
      states: {},
      confusions: [],
      settings: { ...settings, newPerDay: 10, sessionMinutes: 10 },
      now,
      rng: rng(),
      refresh: true,
    });
    expect(session.queue.length).toBeGreaterThan(60);
    expect(session.queue.every((i) => i.mode === 'scan')).toBe(true);
  });

  it('brings a "New to me" card back as a real question', () => {
    const cards = [spot('s0', 'c0')];
    const [retry] = requeueMissed([], { cardId: 's0', mode: 'scan' }, cards);
    expect(retry).toMatchObject({ cardId: 's0', mode: 'mcq', retry: true });
  });
});

describe('reviewSecondsFrom', () => {
  it("follows the learner's own answer speed", () => {
    expect(reviewSecondsFrom(Array(40).fill(2000))).toBe(3.5);
    expect(reviewSecondsFrom(Array(40).fill(20000))).toBe(8);
    expect(reviewSecondsFrom([1000])).toBeUndefined();
  });
});

describe('scanCardSeconds', () => {
  it('counts the retry each "New to me" costs', () => {
    expect(scanCardSeconds({ answered: 50, right: 50 })).toBe(5);
    expect(scanCardSeconds({ answered: 50, right: 25 })).toBe(13);
  });
});
