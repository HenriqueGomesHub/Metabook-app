import { describe, expect, it } from 'vitest';
import { generateCards } from './generate';
import type { CountryFacts, MediaItem, MetaSubject, PoolCountry } from './types';

const country = (code: string, name: string, continent: PoolCountry['continent'] = 'europe') => ({
  code,
  name,
  continent,
  in_pool: true,
});

const pool: PoolCountry[] = [
  country('PL', 'Poland'),
  country('LT', 'Lithuania'),
  country('CZ', 'Czechia'),
  country('SK', 'Slovakia'),
  country('DE', 'Germany'),
  country('GB', 'United Kingdom'),
  country('IE', 'Ireland'),
  country('JP', 'Japan', 'asia'),
  { ...country('RU', 'Russia'), in_pool: false },
];

const photo = (code: string, n: number, subject: MetaSubject = 'bollard'): MediaItem => ({
  id: `${code.toLowerCase()}-c${n}`,
  country: code,
  subject,
  url: `approved/${code.toLowerCase()}-c${n}.webp`,
  width: 1280,
  height: 960,
  credit: 'Ana Ruiz · Wikimedia Commons · CC BY-SA 4.0',
  licence: 'CC BY-SA 4.0',
  sourceUrl: `https://commons.wikimedia.org/wiki/File:${code}${n}.jpg`,
});

const facts = (code: string, name: string, extra: Partial<CountryFacts> = {}): CountryFacts => ({
  code,
  name,
  notes: [],
  ...extra,
});

// hand-written facts files may use a lower-case code
const plFacts = facts('pl', 'Poland', {
  wikidata: 'Q36',
  drivingSide: 'right',
  tld: ['.pl'],
  callingCode: ['+48'],
  notes: [
    {
      id: 'bollard-red',
      subject: 'bollard',
      text: 'White bollard with a red band and a red reflector.',
      distinctive: true,
      lookalikes: ['lt', 'Slovakia', 'XX'],
      source: 'https://www.plonkit.net/poland',
      checked: '2026-11-01',
      verified: true,
    },
    {
      id: 'sign-yellow',
      subject: 'sign',
      text: 'Yellow-backed warning signs.',
      distinctive: true,
      source: 'https://www.plonkit.net/poland',
      checked: '2026-11-01',
      verified: true,
    },
    {
      id: 'pole-draft',
      subject: 'pole',
      text: 'Unchecked pole note.',
      distinctive: true,
      source: 'https://www.plonkit.net/poland',
      checked: '2026-11-01',
      verified: false,
    },
  ],
});

const media = [
  { ...photo('PL', 2), noteId: 'bollard-red', caption: 'Roadside post at dusk' },
  photo('PL', 1),
  photo('LT', 1),
  photo('CZ', 1),
  photo('DE', 1),
  photo('JP', 1, 'pole'),
];

describe('generateCards', () => {
  it('makes a forward image card per photo with a stable id, credit and lookalike options', () => {
    const cards = generateCards('PL', { pool, facts: [plFacts], media });
    const card = cards.find((c) => c.id === 'gen:pl:bollard:pl-c2');
    expect(card).toMatchObject({
      type: 'meta',
      country: 'PL',
      answer: 'Poland',
      subject: 'bollard',
      media: ['pl-c2'],
      source: 'https://www.plonkit.net/poland',
      prompt: {
        kind: 'image',
        value: 'approved/pl-c2.webp',
        alt: 'Roadside post at dusk',
        credit: 'Ana Ruiz · Wikimedia Commons · CC BY-SA 4.0',
        creditUrl: 'https://commons.wikimedia.org/wiki/File:PL2.jpg',
      },
      tags: ['europe', 'bollard', 'generated'],
    });
    expect(card?.options).toHaveLength(4);
    // lookalikes (code in any case, or a name) come first; unknown entries are ignored
    expect(card?.options).toEqual(expect.arrayContaining(['Poland', 'Lithuania', 'Slovakia']));
    // no countries from other continents or outside the pool
    expect(card?.options).not.toContain('Japan');
    expect(card?.options).not.toContain('Russia');
  });

  it('replaces captions that name the country, capital, demonym or code with a neutral alt', () => {
    const withFacts = { ...plFacts, capital: 'Warsaw', demonym: ['Polish', 'Poles'] };
    const alt = (caption: string) => {
      const input = { pool, facts: [withFacts], media: [{ ...photo('PL', 1), caption }] };
      const card = generateCards('PL', input).find((c) => c.id === 'gen:pl:bollard:pl-c1');
      return card?.prompt.alt;
    };
    expect(alt('Roadside post at dusk')).toBe('Roadside post at dusk');
    for (const caption of ['Bollard in POLAND', 'Street in warsaw', 'A polish pole', 'Sign, PL.']) {
      expect(alt(caption)).toBe('Photo of a bollard');
    }
    // "pl" inside another word is not the code
    expect(alt('Plain post')).toBe('Plain post');
  });

  it('skips notes whose text names the country or a demonym', () => {
    const note = (id: string, text: string) => ({ ...plFacts.notes[0]!, id, text });
    const withNotes = {
      ...plFacts,
      demonym: ['Polish'],
      notes: [
        note('a', 'Red band bollard.'),
        note('b', 'Typical in Poland.'),
        note('c', 'The polish red band.'),
      ],
    };
    const ids = generateCards('PL', { pool, facts: [withNotes], media: [] }).map((c) => c.id);
    expect(ids).toContain('gen:pl:note:a');
    expect(ids).not.toContain('gen:pl:note:b');
    expect(ids).not.toContain('gen:pl:note:c');
  });

  it('is deterministic', () => {
    const input = { pool, facts: [plFacts], media };
    expect(generateCards('PL', input)).toEqual(generateCards('PL', input));
    expect(generateCards('PL', { ...input, media: [...media].reverse() })).toEqual(
      generateCards('PL', input),
    );
  });

  it('makes a reverse photo-choice card once three other countries have the subject', () => {
    const cards = generateCards('PL', { pool, facts: [plFacts], media });
    const choice = cards.find((c) => c.type === 'photo-choice');
    expect(choice).toMatchObject({
      id: 'gen:pl:bollard:choice',
      answer: 'pl-c1',
      prompt: { kind: 'text', value: 'Poland’s bollard?' },
      subject: 'bollard',
    });
    expect([...(choice?.options ?? [])].sort()).toEqual(['cz-c1', 'de-c1', 'lt-c1', 'pl-c1']);
    expect(choice?.media).toEqual(choice?.options);

    const fewer = media.filter((m) => m.country !== 'DE');
    expect(
      generateCards('PL', { pool, facts: [plFacts], media: fewer }).some(
        (c) => c.type === 'photo-choice',
      ),
    ).toBe(false);
  });

  it('makes domain and calling-code cards, skipping values another country shares', () => {
    const ie = facts('IE', 'Ireland', { tld: ['.ie'], callingCode: ['+48'] });
    const cards = generateCards('PL', { pool, facts: [plFacts, ie], media: [] });
    const tld = cards.find((c) => c.id === 'gen:pl:tld');
    expect(tld).toMatchObject({
      prompt: { kind: 'text', value: 'Websites end in .pl' },
      answer: 'Poland',
      source: 'https://www.wikidata.org/wiki/Q36',
      verified: false,
    });
    expect(cards.some((c) => c.id === 'gen:pl:calling')).toBe(false);
    expect(cards.some((c) => c.id === 'gen:pl:drive')).toBe(false);
  });

  it('makes a driving-side card only for left-driving countries, with right-driving options', () => {
    const input = {
      pool,
      facts: [
        facts('GB', 'United Kingdom', { drivingSide: 'left' }),
        facts('IE', 'Ireland', { drivingSide: 'left' }),
        facts('DE', 'Germany', { drivingSide: 'right' }),
        facts('CZ', 'Czechia', { drivingSide: 'right' }),
      ],
      media: [],
    };
    const card = generateCards('GB', input).find((c) => c.id === 'gen:gb:drive');
    expect(card?.prompt.value).toBe('Traffic drives on the left');
    expect([...(card?.options ?? [])].sort()).toEqual(['Czechia', 'Germany', 'United Kingdom']);
  });

  it('makes text cards for verified distinctive notes that have no photo', () => {
    const ids = generateCards('PL', { pool, facts: [plFacts], media })
      .filter((c) => c.id.includes(':note:'))
      .map((c) => c.id);
    expect(ids).toEqual(['gen:pl:note:sign-yellow']);
  });

  it('rejects a country outside the pool file', () => {
    expect(() => generateCards('ZZ', { pool, facts: [], media: [] })).toThrow(/pool/);
  });
});
