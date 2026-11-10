import { describe, expect, it } from 'vitest';
import { CLUE_NAMES, CLUE_POOL } from './__fixtures__/clues';
import { clueCards, streetViewZoom } from './clueCards';
import { clueCardIds, distinctImages, primaryCardId, quizImages } from './clues';
import type { Clue, ClueCountry, ClueImage } from './clues';
import type { PoolCountry } from './types';

const img = (id: string, src: string, extra: Partial<ClueImage> = {}): ClueImage => ({
  id,
  src,
  ...extra,
});

const bollard = (id: string, fields: Partial<Clue> = {}): Clue => ({
  id,
  step: 0,
  order: 0,
  family: 'bollard',
  title: 'Bollard',
  text: ['Bollards.'],
  tags: [],
  images: [img(`${id}-1`, `https://www.plonkit.net/images/${id}.png`)],
  locations: [],
  lookalikes: [],
  credit: { source: 'Plonk It', url: 'https://www.plonkit.net/x', licence: 'CC BY-NC-SA 4.0' },
  ...fields,
});

const country = (code: string, name: string, clues: Clue[]): ClueCountry => ({
  country: code,
  name,
  sourceUrl: 'https://www.plonkit.net/x',
  fetchedAt: '2026-11-09T12:00:00.000Z',
  steps: [{ title: 'Identifying' }],
  clues,
});

const pc = (code: string, name: string): PoolCountry => ({
  code,
  name,
  continent: 'europe',
  in_pool: true,
});

const POOL: PoolCountry[] = [
  ...CLUE_POOL,
  pc('IT', 'Italy'),
  pc('AL', 'Albania'),
  pc('GR', 'Greece'),
  pc('FR', 'France'),
  pc('ES', 'Spain'),
];

describe('quiz images', () => {
  it('drops dupeOf images and repeats of a picture re-hosted at the same size', () => {
    const images = [
      img('a', 'https://www.plonkit.net/images/fr/bollard.png', { width: 800, height: 393 }),
      img('b', 'https://learnablemeta.com/images/1/xyz.avif', { width: 800, height: 393 }),
      img('c', 'https://www.plonkit.net/images/fr/bollard2.png', { width: 800, height: 393 }),
      img('d', 'https://www.plonkit.net/images/fr/other.png', { dupeOf: 'a' }),
      img('e', 'https://cdn.example.org/a/bollard.png', { width: 800, height: 393 }),
    ];
    expect(distinctImages(images).map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('keeps comparison and annotated images and uncropped giveaways out of quizzes, two at most', () => {
    const clue = bollard('fr-x', {
      images: [
        img('cmp', 'https://x/1.png', { role: 'comparison', caption: 'France vs Spain' }),
        img('ann', 'https://x/2.png', { role: 'annotated' }),
        img('map', 'https://x/3.png', { giveaway: true }),
        img('ok1', 'https://x/4.png', { role: 'example' }),
        img('ok2', 'https://x/5.png'),
        img('ok3', 'https://x/6.png'),
      ],
    });
    expect(quizImages(clue).map((i) => i.id)).toEqual(['ok1', 'ok2']);
    expect(primaryCardId(clue)).toBe(clueCardIds.spot('fr-x', 'ok1'));
    const cards = clueCards({ clues: [country('FR', 'France', [clue])], pool: POOL });
    expect(cards.filter((c) => c.type === 'spot').map((c) => c.clue?.image?.id)).toEqual([
      'ok1',
      'ok2',
    ]);
  });
});

describe('sameAs and differs', () => {
  const catalogue = [
    country('IT', 'Italy', [bollard('it-b')]),
    country('AL', 'Albania', [bollard('al-b', { sameAs: ['IT'] })]),
    country('GR', 'Greece', [bollard('gr-b')]),
    country('FR', 'France', [bollard('fr-b')]),
    country('ES', 'Spain', [bollard('es-b')]),
    country('DE', 'Germany', [bollard('de-b', { differs: [{ country: 'IT', how: 'taller' }] })]),
  ];
  const cards = clueCards({ clues: catalogue, pool: POOL, names: CLUE_NAMES });

  it('never offers a country where the clue looks the same, either way round', () => {
    const albania = cards.filter((c) => c.country === 'AL');
    const italy = cards.filter((c) => c.country === 'IT');
    for (const card of albania) {
      expect(card.options).not.toContain('Italy');
      expect(card.clue?.distractors ?? []).not.toContain('Italy');
      expect(card.clue?.alternates?.map((a) => a.country) ?? []).not.toContain('IT');
    }
    for (const card of italy) {
      expect(card.options).not.toContain('Albania');
      expect(card.clue?.distractors ?? []).not.toContain('Albania');
      expect(card.clue?.choices?.map((a) => a.country) ?? []).not.toContain('AL');
      expect(card.clue?.alternates?.map((a) => a.country) ?? []).not.toContain('AL');
    }
  });

  it('ranks "differs" countries first in the distractor pool', () => {
    const spot = cards.find((c) => c.id === clueCardIds.spot('de-b', 'de-b-1'))!;
    expect(spot.clue?.close).toBe(1);
    expect(spot.clue?.distractors?.[0]).toBe('Italy');
  });
});

describe('streetViewZoom', () => {
  it('turns a field of view into the embed zoom level', () => {
    expect(streetViewZoom(90)).toBe(1);
    expect(streetViewZoom(45)).toBe(2);
    expect(streetViewZoom(180)).toBeCloseTo(Math.log2(1.5), 3);
    expect(streetViewZoom(1)).toBeCloseTo(Math.log2(18), 3);
    expect(streetViewZoom(Number.NaN)).toBeCloseTo(0.78, 2);
    expect(streetViewZoom(0)).toBeCloseTo(0.78, 2);
  });
});

describe('slim catalogue with review fields', () => {
  it('keeps summary, sameAs, differs and image role, caption and dupeOf', async () => {
    const { expandCatalogue, slimCatalogue } = await import('./clueSlim');
    const clue = bollard('al-b', {
      summary: 'Red and white bollards, like Italy’s.',
      sameAs: ['IT'],
      differs: [{ country: 'GR', how: 'Greek ones have a yellow strip' }],
      images: [
        img('one', 'https://x/1.png', { role: 'example', caption: 'An Albanian bollard' }),
        img('two', 'https://x/2.png', { dupeOf: 'one' }),
      ],
    });
    const [back] = expandCatalogue(
      JSON.parse(JSON.stringify(slimCatalogue([country('AL', 'Albania', [clue])]))),
    );
    expect(back?.clues[0]).toEqual({ ...clue, text: [], tags: [] });
  });
});
