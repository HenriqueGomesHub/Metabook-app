// A small clue catalogue modelled on real Plonk It pages, for tests.
import type { Clue, ClueCountry, ClueImage } from '../clues';
import type { PoolCountry } from '../types';

const credit = (slug: string): Clue['credit'] => ({
  source: 'Plonk It',
  url: `https://www.plonkit.net/${slug}`,
  licence: 'CC BY-NC-SA 4.0',
});

const image = (id: string, src: string, extra: Partial<ClueImage> = {}): ClueImage => ({
  id,
  src,
  ...extra,
});

const clue = (slug: string, fields: Partial<Clue> & Pick<Clue, 'id' | 'family'>): Clue => ({
  step: 0,
  order: 0,
  title: fields.family,
  text: [],
  tags: [fields.family],
  images: [],
  locations: [],
  lookalikes: [],
  credit: credit(slug),
  ...fields,
});

const country = (code: string, name: string, slug: string, clues: Clue[]): ClueCountry => ({
  country: code,
  name,
  sourceUrl: `https://www.plonkit.net/${slug}`,
  fetchedAt: '2026-11-09T12:00:00.000Z',
  steps: [{ title: `Identifying ${name}` }, { title: 'Regional clues' }],
  clues,
});

export const PL_BOLLARD = clue('poland', {
  id: 'PL-vySo',
  family: 'bollard',
  order: 1,
  title: 'Bollard: red strip',
  text: [
    'Polish bollards have a **red strip** that wraps all the way around the bollard. This strip has a red reflector on the front (sometimes hard to see), and a white reflector on the back.',
    'NOTE: The same design can be found in [Zakarpattia Oblast](https://www.google.com/maps/@48.4892755,22.8226335,3a,15y,293.62h,67.76t) in Ukraine.',
  ],
  images: [image('a1b2c3', 'https://www.plonkit.net/images/poland/Poland-bollard.png')],
  locations: [
    {
      pano: 'SZfQwOcH5qCjpxAWOGmgIg',
      lat: 48.4892755,
      lng: 22.8226335,
      heading: 293.62,
      pitch: -22.24,
      fov: 15,
      source: 'plonkit',
    },
  ],
  lookalikes: ['UA'],
});

export const PL_POLE = clue('poland', {
  id: 'PL-doge',
  family: 'pole',
  order: 2,
  title: 'Pole: holey poles',
  text: ['Poland usually has thin concrete utility poles with see-through holes.'],
  images: [
    image('d4e5f6', 'https://www.plonkit.net/images/poland/Poland-poles-comp2.png'),
    // a map with the country name on it: a giveaway, kept out of drills
    image('aa0001', 'https://www.plonkit.net/images/poland/Poland-poles-map.png', {
      giveaway: true,
    }),
    // also a giveaway, but cropped down to the pole itself
    image('aa0002', 'https://www.plonkit.net/images/poland/Poland-poles-sign.png', {
      giveaway: true,
      crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
      path: 'pl/aa0002.webp',
    }),
  ],
});

export const PL_LANGUAGE = clue('poland', {
  id: 'PL-lang',
  family: 'language',
  step: 1,
  order: 0,
  title: 'Language: Polish letters',
  text: ['Polish uses the letters **ł**, **ż** and **ś**.'],
});

export const PL_KASHUBIAN = clue('poland', {
  id: 'PL-kash',
  family: 'language',
  step: 1,
  order: 1,
  title: 'Language: bilingual signs',
  text: [
    'In the north, around Gdańsk, some town signs are *bilingual* with a second language underneath. See [an example](https://maps.app.goo.gl/example).',
  ],
  region: 'Pomeranian Voivodeship',
});

export const CZ_BOLLARD = clue('czechia', {
  id: 'CZ-k2x9',
  family: 'bollard',
  title: 'Bollard: orange reflector',
  text: ['Bollards have a black cap with an **orange** reflector.'],
  images: [image('c0ffee', 'https://www.plonkit.net/images/czechia/Czechia-bollard.png')],
  lookalikes: ['SK'],
});

export const SK_BOLLARD = clue('slovakia', {
  id: 'SK-b001',
  family: 'bollard',
  title: 'Bollard: black stripe',
  text: ['Bollards have a slanted black top.'],
  images: [image('5ca1ab', 'https://www.plonkit.net/images/slovakia/Slovakia-bollard.png')],
});

export const DE_BOLLARD = clue('germany', {
  id: 'DE-b001',
  family: 'bollard',
  title: 'Bollard: black band',
  text: ['Bollards have a black band and a white reflector.'],
  images: [image('de0001', 'https://www.plonkit.net/images/germany/Germany-bollard.png')],
});

export const UA_BOLLARD = clue('ukraine', {
  id: 'UA-b001',
  family: 'bollard',
  title: 'Bollard: striped',
  text: ['Bollards are striped black and white.'],
  images: [image('ua0001', 'https://www.plonkit.net/images/ukraine/Ukraine-bollard.png')],
});

export const BR_POLE = clue('brazil', {
  id: 'BR-p001',
  family: 'pole',
  title: 'Pole: concrete cross',
  text: ['Brazilian poles are often rectangular concrete with a **cross-shaped** base.'],
  images: [image('b7a5e1', 'https://www.plonkit.net/images/brazil/Brazil-pole.png')],
  locations: [
    {
      pano: 'brPano000000000000000A',
      lat: -23.55,
      lng: -46.63,
      heading: 10,
      pitch: 0,
      fov: 90,
      source: 'plonkit',
    },
    // no pano: no Live view card for it
    { lat: -22.9, lng: -43.2, heading: 0, pitch: 0, fov: 90, source: 'plonkit' },
  ],
});

export const CLUE_COUNTRIES: ClueCountry[] = [
  country('PL', 'Poland', 'poland', [PL_KASHUBIAN, PL_POLE, PL_BOLLARD, PL_LANGUAGE]),
  country('CZ', 'Czechia', 'czechia', [CZ_BOLLARD]),
  country('SK', 'Slovakia', 'slovakia', [SK_BOLLARD]),
  country('DE', 'Germany', 'germany', [DE_BOLLARD]),
  country('UA', 'Ukraine', 'ukraine', [UA_BOLLARD]),
  country('BR', 'Brazil', 'brazil', [BR_POLE]),
];

const pc = (code: string, name: string, continent: PoolCountry['continent']): PoolCountry => ({
  code,
  name,
  continent,
  in_pool: true,
});

export const CLUE_POOL: PoolCountry[] = [
  pc('PL', 'Poland', 'europe'),
  pc('CZ', 'Czechia', 'europe'),
  pc('SK', 'Slovakia', 'europe'),
  pc('DE', 'Germany', 'europe'),
  pc('UA', 'Ukraine', 'europe'),
  pc('HU', 'Hungary', 'europe'),
  pc('LT', 'Lithuania', 'europe'),
  pc('BR', 'Brazil', 'americas'),
  pc('AR', 'Argentina', 'americas'),
  pc('JP', 'Japan', 'asia'),
];

export const CLUE_NAMES = [
  { code: 'PL', demonym: ['Polish', 'Pole', 'Poles'], capital: 'Warsaw' },
  { code: 'CZ', demonym: ['Czech', 'Czechs'], capital: 'Prague' },
  { code: 'BR', demonym: ['Brazilian', 'Brazilians'], capital: 'Brasília' },
];
