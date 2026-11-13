import { describe, expect, it } from 'vitest';
import {
  generateCards,
  hideRegionName,
  isClueCard,
  namesOtherRegions,
  resolveRegion,
} from './generate';
import type { CountryFacts, FactNote, PoolCountry, RegionMapNames } from './types';

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

describe('generateCards', () => {
  it('is deterministic', () => {
    const input = { pool, facts: [plFacts] };
    expect(generateCards('PL', input)).toEqual(generateCards('PL', input));
  });

  it('makes no cards from notes: the clue catalogue replaces them', () => {
    const cards = generateCards('PL', { pool, facts: [plFacts] });
    expect(cards.some((c) => c.id.includes(':note:'))).toBe(false);
  });

  it('makes domain and calling-code cards, skipping values another country shares', () => {
    const ie = facts('IE', 'Ireland', { tld: ['.ie'], callingCode: ['+48'] });
    const cards = generateCards('PL', { pool, facts: [plFacts, ie] });
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

  it('tags text-only fact cards as clue-text, and no map card', () => {
    const cards = generateCards('PL', { pool, facts: [plFacts] });
    const clues = cards.filter(isClueCard);
    expect(clues.length).toBeGreaterThan(0);
    for (const card of cards) {
      const textFact = card.prompt.kind === 'text' && !card.map;
      expect(isClueCard(card)).toBe(textFact);
    }
    expect(clues.map((c) => c.id)).toContain('gen:pl:tld');
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
    };
    const card = generateCards('GB', input).find((c) => c.id === 'gen:gb:drive');
    expect(card?.prompt.value).toBe('Traffic drives on the left');
    expect([...(card?.options ?? [])].sort()).toEqual(['Czechia', 'Germany', 'United Kingdom']);
  });

  it('rejects a country outside the pool file', () => {
    expect(() => generateCards('ZZ', { pool, facts: [] })).toThrow(/pool/);
  });
});

const plMap: RegionMapNames = {
  country: 'PL',
  states: [
    { code: 'DS', name: 'Lower Silesian' },
    { code: 'MZ', name: 'Masovian' },
    { code: 'PM', name: 'Pomeranian' },
    { code: 'SL', name: 'Silesian' },
    { code: 'LD', name: 'Łódź' },
    // two states with one name: that name is ambiguous
    { code: 'X1', name: 'Twin' },
    { code: 'X2', name: 'Twin' },
    // an unnamed leftover shape, as in some generated maps
    { code: 'POL+99?', name: null as unknown as string },
  ],
};

const regionNote = (id: string, region: string | undefined, extra: Partial<FactNote> = {}) => ({
  id,
  subject: 'pole' as const,
  text: `Note ${id}.`,
  ...(region !== undefined && { region }),
  source: 'https://www.plonkit.net/poland',
  checked: '2026-11-01',
  verified: true,
  ...extra,
});

describe('resolveRegion', () => {
  it('matches an ISO 3166-2 suffix against the state code, ignoring case', () => {
    expect(resolveRegion('PL-MZ', 'PL', plMap)?.code).toBe('MZ');
    expect(resolveRegion('pl-ds', 'PL', plMap)?.code).toBe('DS');
  });

  it('falls back to an exact, accent- and case-insensitive name match', () => {
    expect(resolveRegion('masovian', 'PL', plMap)?.code).toBe('MZ');
    expect(resolveRegion('Lodz', 'PL', plMap)?.code).toBe('LD');
    // exact, not partial: "Silesian" is not "Lower Silesian"
    expect(resolveRegion('Silesian', 'PL', plMap)?.code).toBe('SL');
    expect(resolveRegion('Silesia', 'PL', plMap)).toBeUndefined();
  });

  it('skips plain labels, unknown codes, other countries’ codes and ambiguous names', () => {
    for (const region of ['north', 'PL-ZZ', 'DE-MZ', 'Twin', '']) {
      expect(resolveRegion(region, 'PL', plMap)).toBeUndefined();
    }
  });
});

describe('where cards', () => {
  const notes = [
    regionNote('pl:a', 'PL-MZ'),
    regionNote('pl:b', 'pomeranian'),
    regionNote('pl:c', 'PL-ds', { verified: false }),
    regionNote('pl:d', 'Łódź', { subject: 'sign' }),
    regionNote('pl:e', 'north'),
    regionNote('pl:f', 'Twin'),
    regionNote('pl:g', undefined),
  ];
  const input = (list: FactNote[]) => ({
    pool,
    facts: [facts('PL', 'Poland', { notes: list })],
    maps: { PL: plMap },
  });
  const where = (list: FactNote[], maps?: Record<string, RegionMapNames>) =>
    generateCards('PL', { ...input(list), ...(maps && { maps }) }).filter((c) =>
      c.id.includes(':where:'),
    );

  it('makes a map card for every note that resolves to one state', () => {
    const cards = where(notes);
    expect(cards.map((c) => c.id)).toEqual([
      'gen:pl:where:a',
      'gen:pl:where:b',
      'gen:pl:where:c',
      'gen:pl:where:d',
    ]);
    expect(cards[0]).toEqual({
      id: 'gen:pl:where:a',
      type: 'region',
      country: 'PL',
      answer: 'MZ',
      prompt: { kind: 'text', value: 'Note pl:a.' },
      tags: ['europe', 'pole', 'generated', 'where'],
      subject: 'pole',
      explain: 'Note pl:a. (Masovian)',
      map: 'pl',
      source: 'https://www.plonkit.net/poland',
      verified: true,
    });
    expect(cards[2]).toMatchObject({ answer: 'DS', verified: false });
    expect(cards[3]).toMatchObject({ answer: 'LD', subject: 'sign', explain: 'Note pl:d. (Łódź)' });
  });

  it('needs at least four resolvable notes and a map for the country', () => {
    expect(where(notes.filter((n) => n.id !== 'pl:d'))).toEqual([]);
    expect(where(notes, {})).toEqual([]);
  });

  it('is deterministic whatever the note order', () => {
    expect(where([...notes].reverse())).toEqual(where(notes));
  });
});

describe('hideRegionName', () => {
  it('masks the state name, its short form and accented spellings', async () => {
    const { hideRegionName } = await import('./generate');
    expect(hideRegionName('Sugarcane is most common in Tucumán.', 'Tucumán')).toBe(
      'Sugarcane is most common in this area.',
    );
    expect(hideRegionName('Łódź has red tiles.', 'Łódź Voivodeship')).toBe(
      'This area has red tiles.',
    );
    expect(hideRegionName('Masovian has wide poles.', 'Masovian Voivodeship')).toBe(
      'This area has wide poles.',
    );
    expect(hideRegionName('Yellow poles here.', 'Texas')).toBe('Yellow poles here.');
  });
  it('drops the card when another spelling still names the answer', async () => {
    const { hideRegionName } = await import('./generate');
    expect(hideRegionName('In Tucuman the cane grows.', 'Tucumán')).toBeUndefined();
  });

  it('masks the meaningful parts of multi-word names, never generic words', async () => {
    const { hideRegionName, regionNameParts } = await import('./generate');
    expect(regionNameParts('Buenos Aires (City)')).toEqual(['Buenos Aires', 'Buenos', 'Aires']);
    expect(regionNameParts('Trinidad and Tobago')).toEqual(['Trinidad', 'Tobago']);
    expect(regionNameParts('Kujawy-Pomerania')).toEqual(['Kujawy', 'Pomerania']);
    expect(regionNameParts('Northern Territory')).toEqual([]);
    expect(regionNameParts('New South Wales')).toEqual(['New South Wales', 'Wales']);
    expect(hideRegionName('Wide verges all over Wales.', 'New South Wales')).toBe(
      'Wide verges all over this area.',
    );
    expect(hideRegionName('Pampas grass west of Aires.', 'Buenos Aires (B)')).toBe(
      'Pampas grass west of this area.',
    );
    // generic words stay: "north" is not a giveaway for Northern Territory
    expect(hideRegionName('Red soil in the north.', 'Northern Territory')).toBe(
      'Red soil in the north.',
    );
  });

  it('drops prompts the mask leaves reading wrongly', async () => {
    const { hideRegionName } = await import('./generate');
    expect(hideRegionName('Only the Masovian plains are flat.', 'Masovian')).toBeUndefined();
    expect(hideRegionName('Masovian’s poles are grey.', 'Masovian')).toBeUndefined();
    for (const word of [
      'state',
      'province',
      'region',
      'peninsula',
      'coast',
      'roads',
      'island',
      'poles',
    ]) {
      expect(hideRegionName(`Texas ${word} has it.`, 'Texas')).toBeUndefined();
    }
    expect(hideRegionName('Texas has it.', 'Texas')).toBe('This area has it.');
  });
});

describe('map questions with one right region', () => {
  it('sees text placing a clue in several regions', () => {
    expect(namesOtherRegions('Also in Lleida and Tarragona.')).toBe(true);
    expect(namesOtherRegions('Most common here; frequent in RS, RJ, MS.')).toBe(true);
    expect(namesOtherRegions('Common in this area and Pernambuco.')).toBe(true);
    expect(namesOtherRegions('Yellow poles are common in this area.')).toBe(false);
  });

  it('drops a sentence whose region name was masked mid-phrase', () => {
    expect(hideRegionName('Only in far northwestern Lapland.', 'Lapland')).toBeUndefined();
    expect(hideRegionName('Reindeer roam Lapland.', 'Lapland')).toBe('Reindeer roam this area.');
  });
});
