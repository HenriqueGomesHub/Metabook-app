import { describe, expect, it } from 'vitest';
import {
  ACTIVE_COUNTRIES,
  activeCountries,
  COUNTRY_PRIORITY,
  countryOrder,
  MAX_FAMILY_SHARE,
  MAX_SIBLINGS_PER_DAY,
  pickNewCards,
} from './curriculum';
import { interleave, learnMoreSession, practiseMoreSession } from './session';
import type { Card, CardState, CardType, MetaSubject } from './types';

const card = (id: string, type: CardType, country: string, extra: Partial<Card> = {}): Card => ({
  id,
  type,
  country,
  answer: country,
  prompt: { kind: 'text', value: id },
  tags: [],
  source: 'https://example.org',
  ...extra,
});

/** A clue's cards as clueCards emits them: a Spot it per image, Which clue, Live view per spot. */
function clue(
  country: string,
  name: string,
  family: MetaSubject,
  { images = 1, which = false, live = 0 } = {},
): Card[] {
  const id = `${country}-${name}`;
  const base = { subject: family, clue: { id } };
  return [
    ...Array.from({ length: images }, (_, i) =>
      card(`clue:${id}:spot:${i}`, 'spot', country, base),
    ),
    ...(which ? [card(`clue:${id}:which`, 'which', country, base)] : []),
    ...Array.from({ length: live }, (_, i) => card(`clue:${id}:live:${i}`, 'live', country, base)),
  ];
}

const seen = (cardId: string): CardState => ({
  cardId,
  due: '2026-03-30T00:00:00Z',
  stability: 10,
  difficulty: 5,
  elapsedDays: 10,
  scheduledDays: 10,
  reps: 3,
  lapses: 0,
  state: 'review',
  lastReview: '2026-03-01T12:00:00Z',
});

const clueId = (c: Card) => c.clue?.id;
const ids = (cards: Card[]) => cards.map((c) => c.id);

/** Six countries of the priority list, given out of order, with a few clues each. */
const COUNTRIES = ['FR', 'US', 'JP', 'BR', 'CA', 'RU'];
const catalogue = COUNTRIES.flatMap((code) => [
  ...clue(code, 'land', 'landscape', { images: 2 }),
  ...clue(code, 'bollard', 'bollard', { images: 3, which: true, live: 1 }),
  ...clue(code, 'plate', 'plate'),
  ...clue(code, 'pole', 'pole', { images: 2 }),
]);

describe('countryOrder', () => {
  it('puts focus countries first, then the priority list, then the rest alphabetically', () => {
    expect(countryOrder(['ZZ', 'FR', 'AA', 'US', 'BR'])).toEqual(['US', 'BR', 'FR', 'AA', 'ZZ']);
    expect(countryOrder(['FR', 'US', 'BR'], ['fr'])).toEqual(['FR', 'US', 'BR']);
    expect(COUNTRY_PRIORITY.slice(0, 4)).toEqual(['US', 'BR', 'RU', 'CA']);
  });
});

describe('activeCountries', () => {
  it('is the first countries in priority order that still have new clue cards', () => {
    expect(activeCountries(catalogue, {})).toEqual(['US', 'BR', 'RU', 'CA']);
    expect(ACTIVE_COUNTRIES).toBe(4);
  });

  it('lets the next country join once one is fully introduced', () => {
    const states = Object.fromEntries(
      catalogue.filter((c) => c.country === 'BR').map((c) => [c.id, seen(c.id)]),
    );
    expect(activeCountries(catalogue, states)).toEqual(['US', 'RU', 'CA', 'JP']);
  });
});

describe('pickNewCards', () => {
  it('takes clue cards round-robin from the active countries only', () => {
    const picked = pickNewCards({ cards: catalogue, states: {}, count: 8 });
    expect(picked.map((c) => c.country)).toEqual(['US', 'BR', 'RU', 'CA', 'US', 'BR', 'RU', 'CA']);
  });

  it('rotates through the families in FAMILY_ROTATION order, landscape late', () => {
    const us = catalogue.filter((c) => c.country === 'US');
    const picked = pickNewCards({ cards: us, states: {}, count: us.length });
    const clues = [...new Set(picked.map(clueId))];
    expect(clues).toEqual(['US-bollard', 'US-pole', 'US-plate', 'US-land']);
    // one card per family per turn: the four families before any second card
    expect(picked.slice(0, 4).map((c) => c.subject)).toEqual([
      'bollard',
      'pole',
      'plate',
      'landscape',
    ]);
    // a pair per clue first: Spot it then Which clue of the bollard, before its other cards
    expect(ids(picked.filter((c) => clueId(c) === 'US-bollard'))).toEqual([
      'clue:US-bollard:spot:0',
      'clue:US-bollard:which',
    ]);
  });

  it(`gives no family more than ${MAX_FAMILY_SHARE * 100}% of a day while others have cards`, () => {
    // every country with many bollard clues and a few of everything else
    const big = COUNTRIES.flatMap((code) => [
      ...Array.from({ length: 8 }, (_, i) =>
        clue(code, `bollard${i}`, 'bollard', { images: 2 }),
      ).flat(),
      ...clue(code, 'pole', 'pole', { images: 2 }),
      ...clue(code, 'sign', 'sign', { images: 2 }),
      ...clue(code, 'line', 'line'),
      ...clue(code, 'plate', 'plate'),
      ...clue(code, 'car', 'car'),
      ...clue(code, 'house', 'architecture'),
    ]);
    const picked = pickNewCards({ cards: big, states: {}, count: 20 });
    expect(picked).toHaveLength(20);
    const perFamily = new Map<string, number>();
    for (const c of picked) perFamily.set(c.subject!, (perFamily.get(c.subject!) ?? 0) + 1);
    expect(Math.max(...perFamily.values())).toBeLessThanOrEqual(Math.ceil(20 * MAX_FAMILY_SHARE));
    expect(perFamily.size).toBeGreaterThanOrEqual(5);
    // the countries start on different families
    expect(new Set(picked.slice(0, 4).map((c) => c.subject)).size).toBe(4);
  });

  it('still fills the day from one family when nothing else is left', () => {
    const only = Array.from({ length: 10 }, (_, i) => clue('US', `b${i}`, 'bollard')).flat();
    expect(pickNewCards({ cards: only, states: {}, count: 8 })).toHaveLength(8);
  });

  it(`introduces at most ${MAX_SIBLINGS_PER_DAY} cards of a clue a day, the rest on later days`, () => {
    const us = clue('US', 'bollard', 'bollard', { images: 3, which: true, live: 1 });
    const day1 = pickNewCards({ cards: us, states: {}, count: 10 });
    expect(ids(day1)).toEqual(['clue:US-bollard:spot:0', 'clue:US-bollard:which']);
    const states = Object.fromEntries(day1.map((c) => [c.id, seen(c.id)]));
    // later the same day nothing more of this clue
    expect(pickNewCards({ cards: us, states, count: 10, introducedToday: ids(day1) })).toEqual([]);
    // the next day: the next pair, spread over types
    expect(ids(pickNewCards({ cards: us, states, count: 10 }))).toEqual([
      'clue:US-bollard:live:0',
      'clue:US-bollard:spot:1',
    ]);
  });

  it('never gives more than two cards of a clue in one day across all countries', () => {
    const picked = pickNewCards({ cards: catalogue, states: {}, count: 200 });
    const perClue = new Map<string, number>();
    for (const c of picked) perClue.set(clueId(c)!, (perClue.get(clueId(c)!) ?? 0) + 1);
    expect(Math.max(...perClue.values())).toBe(MAX_SIBLINGS_PER_DAY);
  });

  it('brings in the next countries when the active ones have nothing left today', () => {
    const picked = pickNewCards({ cards: catalogue, states: {}, count: 40 });
    expect(new Set(picked.map((c) => c.country))).toEqual(new Set(COUNTRIES));
    expect(picked).toHaveLength(40);
  });

  it('mixes in other cards at about a fifth, by country priority', () => {
    const others = ['FR', 'BR', 'US', 'JP', 'CA'].flatMap((code) => [
      card(`flag:${code}`, 'flag', code),
      card(`script:${code}`, 'script', code),
    ]);
    const picked = pickNewCards({ cards: [...others, ...catalogue], states: {}, count: 20 });
    const other = picked.filter((c) => !c.clue);
    expect(other).toHaveLength(4);
    expect(ids(other)).toEqual(['flag:US', 'script:US', 'flag:BR', 'script:BR']);
    // woven in, not bunched at one end
    expect(picked.slice(0, 10).filter((c) => !c.clue).length).toBe(2);
  });

  it('fills with other cards when clue cards run out', () => {
    const flags = ['US', 'BR', 'FR'].map((code) => card(`flag:${code}`, 'flag', code));
    const picked = pickNewCards({
      cards: [...flags, ...clue('US', 'x', 'pole')],
      states: {},
      count: 4,
    });
    expect(picked).toHaveLength(4);
  });

  it('is deterministic for a given state', () => {
    const states = { [catalogue[3]!.id]: seen(catalogue[3]!.id) };
    const pick = () => ids(pickNewCards({ cards: catalogue, states, count: 15 }));
    expect(pick()).toEqual(pick());
    expect(pick()).not.toContain(catalogue[3]!.id);
  });
});

describe('interleave', () => {
  it('keeps consecutive cards apart in family and country where it can', () => {
    const reviews = COUNTRIES.flatMap((code) => [
      ...clue(code, 'b', 'bollard'),
      ...clue(code, 'p', 'pole'),
      ...clue(code, 's', 'sign'),
    ]);
    // bunched by family on the way in
    const bunched = [...reviews].sort((a, b) => a.subject!.localeCompare(b.subject!));
    const out = interleave(bunched);
    expect(out).toHaveLength(bunched.length);
    out.forEach((c, i) => {
      if (i === 0) return;
      const prev = out[i - 1]!;
      expect(c.subject === prev.subject && c.country === prev.country).toBe(false);
      expect(c.subject).not.toBe(prev.subject);
    });
  });
});

describe('learn more and practise more', () => {
  const now = new Date('2026-03-15T12:00:00Z');

  it('learns new cards past the daily limit, curriculum order, siblings never back to back', () => {
    const session = learnMoreSession({ cards: catalogue, states: {}, settings: {}, count: 15 });
    expect(session.queue).toHaveLength(15);
    const byId = new Map(catalogue.map((c) => [c.id, c]));
    const queue = session.queue.map((item) => byId.get(item.cardId)!);
    expect(new Set(queue.map((c) => c.country))).toEqual(new Set(['US', 'BR', 'RU', 'CA']));
    queue.forEach((c, i) => i > 0 && expect(clueId(c)).not.toBe(clueId(queue[i - 1]!)));
  });

  it('respects the per-clue daily limit for cards already learned today', () => {
    const us = clue('US', 'bollard', 'bollard', { images: 3, which: true });
    const session = learnMoreSession({
      cards: us,
      states: { 'clue:US-bollard:spot:0': seen('clue:US-bollard:spot:0') },
      settings: {},
      introducedToday: ['clue:US-bollard:spot:0'],
    });
    expect(session.queue.map((i) => i.cardId)).toEqual(['clue:US-bollard:which']);
  });

  it('practises the weakest seen cards ahead of time', () => {
    const cards = ['a', 'b', 'c', 'd'].map((id) => card(id, 'flag', 'US'));
    const states: Record<string, CardState> = {
      a: { ...seen('a'), stability: 50 },
      b: { ...seen('b'), stability: 1 },
      c: { ...seen('c'), stability: 5 },
    };
    const session = practiseMoreSession({ cards, states, now, count: 2 });
    expect(session.queue.map((i) => i.cardId)).toEqual(['b', 'c']);
  });
});
