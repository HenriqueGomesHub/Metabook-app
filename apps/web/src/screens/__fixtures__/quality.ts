// Clues with the image and text review's fields, for the app's tests.
import type { Clue, ClueCountry, PoolCountry } from '@metabook/core';

const credit = { source: 'Plonk It', url: 'https://www.plonkit.net/x', licence: 'CC BY-NC-SA 4.0' };

const bollard = (id: string, title: string, fields: Partial<Clue> = {}): Clue => ({
  id,
  step: 0,
  order: 0,
  family: 'bollard',
  title,
  text: [`${title}.`],
  tags: [],
  images: [{ id: `${id}-1`, src: `https://www.plonkit.net/images/${id}.png` }],
  locations: [],
  lookalikes: [],
  credit: credit as Clue['credit'],
  ...fields,
});

const country = (code: string, name: string, clues: Clue[]): ClueCountry => ({
  country: code,
  name,
  sourceUrl: 'https://www.plonkit.net/x',
  fetchedAt: '2026-11-09T12:00:00.000Z',
  steps: [{ title: `Identifying ${name}` }],
  clues,
});

export const AL_BOLLARD = bollard('AL-b', 'Bollard: red and white', {
  summary: 'Red and white bollards with a red reflector.',
  sameAs: ['IT'],
  differs: [{ country: 'GR', how: 'Greek ones have a yellow strip' }],
  text: [
    'This is the longer Plonk It text about the   bollard , with more words.',
    'See [](https://www.google.com/maps/@1,2,3a) for one.',
  ],
  images: [
    {
      id: 'al1',
      src: 'https://www.plonkit.net/images/albania/bollard.png',
      width: 800,
      height: 393,
    },
    // Learnable Meta's copy of the same picture
    { id: 'al2', src: 'https://learnablemeta.com/images/9/abc.avif', width: 800, height: 393 },
    {
      id: 'al3',
      src: 'https://www.plonkit.net/images/albania/compare.png',
      role: 'comparison',
      caption: 'Albania and Italy side by side',
    },
  ],
});

export const QUALITY_COUNTRIES: ClueCountry[] = [
  country('AL', 'Albania', [AL_BOLLARD]),
  country('IT', 'Italy', [bollard('IT-b', 'Bollard: Italian')]),
  country('GR', 'Greece', [
    bollard('GR-b', 'Bollard: Greek', { summary: 'Greek bollards have a yellow strip.' }),
  ]),
  country('ES', 'Spain', [
    bollard('ES-b', 'Bollard: Spanish', { summary: 'Spanish bollards are short and white.' }),
  ]),
  country('FR', 'France', [
    bollard('FR-b', 'Bollard: French', { summary: 'French bollards have a red cap.' }),
  ]),
  country('DE', 'Germany', [
    bollard('DE-b', 'Bollard: German', { summary: 'German bollards have a black band.' }),
  ]),
];

const pc = (code: string, name: string): PoolCountry => ({
  code,
  name,
  continent: 'europe',
  in_pool: true,
});

export const QUALITY_POOL: PoolCountry[] = [
  pc('AL', 'Albania'),
  pc('IT', 'Italy'),
  pc('GR', 'Greece'),
  pc('ES', 'Spain'),
  pc('FR', 'France'),
  pc('DE', 'Germany'),
];
