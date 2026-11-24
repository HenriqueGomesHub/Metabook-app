import type { PoolCountry } from '@metabook/core';
import { describe, expect, it } from 'vitest';
import {
  areaCodeCards,
  areaCodeCountries,
  isExactAreaCode,
  isZoneCard,
  zoneName,
} from './areaCodes';
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

  it('asks a country with more than 30 regions by area, one card per digit group', () => {
    // 40 regions: codes 3x in the first 20, 4x in the last 20
    const big: AreaCodeFile = {
      country: 'RU',
      label: 'Area codes',
      sources: ['https://example.org/ru'],
      codes: Array.from({ length: 40 }, (_, i) => ({
        code: `${i < 20 ? 3 : 4}${String(10 + i)}`,
        region: `R${i}`,
      })),
    };
    const patterns = {
      RU: {
        kind: 'pattern' as const,
        digits: 1,
        hook: '',
        summary: '',
        groups: [
          { key: '3', label: 'the Urals & Siberia' },
          { key: '4', label: 'Moscow & the Far East' },
        ],
      },
    };
    const russia = { code: 'RU', name: 'Russia', continent: 'europe', in_pool: true } as const;
    const cards = areaCodeCards([big], [russia], [], patterns);
    const zones = cards.filter(isZoneCard);
    expect(zones.map((c) => c.answer)).toEqual(['zone:3', 'zone:4']);
    expect(zones[0]?.prompt.value).toBe('310');
    // every code still has its own card, kept for the "every region" drill
    expect(cards.filter(isExactAreaCode)).toHaveLength(40);
    expect(zoneName('RU', 'zone:4')).toMatch(/^4x: Moscow/);
    // France (5 regions) stays one region per code
    expect(areaCodeCards([fr], pool, [], patterns).some(isZoneCard)).toBe(false);
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
