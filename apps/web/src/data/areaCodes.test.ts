import type { PoolCountry } from '@metabook/core';
import { describe, expect, it } from 'vitest';
import { areaCodeCards, areaCodeCountries } from './areaCodes';
import type { AreaCodeFile } from './areaCodes';

const fr = Object.values(
  import.meta.glob<AreaCodeFile>('./__fixtures__/areacodes-fr.json', {
    eager: true,
    import: 'default',
  }),
)[0] as AreaCodeFile;

const pool: PoolCountry[] = [
  { code: 'FR', name: 'France', continent: 'europe', in_pool: true },
  { code: 'BR', name: 'Brazil', continent: 'americas', in_pool: true },
];

describe('areaCodeCards', () => {
  it('makes nothing from no files', () => {
    expect(areaCodeCards([], pool)).toEqual([]);
  });

  it('makes a card per code, answered on the country’s regions, with the regions it spans', () => {
    const cards = areaCodeCards([fr], pool);
    expect(cards).toHaveLength(5);
    expect(cards[0]).toMatchObject({
      id: 'ddd:fr:1',
      type: 'areacode',
      country: 'FR',
      answer: '75',
      spans: ['92', '93', '94'],
      prompt: { kind: 'text', value: '1' },
      tags: ['europe', 'areacode'],
      chapter: 'fr:areacodes',
      source: 'https://example.org/fr-area-codes',
    });
    expect(cards[2]?.spans).toBeUndefined();
  });

  it('keeps ids already taken (Brazil’s own cards) and skips countries not in the pool', () => {
    const br: AreaCodeFile = {
      country: 'br',
      label: 'DDD',
      sources: [],
      codes: [
        { code: '11', region: 'SP' },
        { code: '21', region: 'RJ' },
      ],
    };
    const xx: AreaCodeFile = { ...br, country: 'XX' };
    const cards = areaCodeCards([br, xx], pool, ['ddd:br:11']);
    expect(cards.map((c) => c.id)).toEqual(['ddd:br:21']);
  });

  it('lists countries with area codes, Brazil first', () => {
    const cards = areaCodeCards([fr], pool);
    const brazil = { ...cards[0]!, id: 'ddd:br:11', country: 'BR' };
    expect(areaCodeCountries([...cards, brazil], pool)).toEqual(['BR', 'FR']);
  });
});
