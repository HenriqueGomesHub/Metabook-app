import type { Card } from '@metabook/core';
import { describe, expect, it } from 'vitest';
import { isRegional, mapsOf, pairScope } from './stats';

const areacode = (answer: string): Card => ({
  id: `ddd:${answer}`,
  type: 'areacode',
  country: 'BR',
  answer,
  prompt: { kind: 'text', value: '11' },
  tags: [],
  source: 'https://example.org',
});

describe('pairScope', () => {
  const cards = [areacode('SP'), areacode('MG')];

  it('scopes area-code pairs to Brazil and leaves country pairs unscoped', () => {
    expect(pairScope(cards, 'SP', 'MG')).toBe('br');
    expect(pairScope(cards, 'RS', 'BG')).toBeUndefined();
  });

  it('scopes map-scoped keys to their map, whatever the area codes say', () => {
    expect(pairScope(cards, 'ca:PE', 'ca:NL')).toBe('ca');
    expect(pairScope(cards, 'ca:PE', 'us:NL')).toBeUndefined();
  });
});

describe('mapsOf', () => {
  it('lists the maps that scoped keys name, once each', () => {
    expect(mapsOf(['ca:PE', 'ca:NL', 'Serbia', 'pl:MZ'])).toEqual(['ca', 'pl']);
  });
});

describe('isRegional', () => {
  const flag: Card = { ...areacode('PL'), id: 'flag:PL', type: 'flag', country: 'PL' };
  it('keeps country cards and flags out, area codes, regions and maps in', () => {
    expect(isRegional(flag)).toBe(false);
    expect(isRegional(areacode('SP'))).toBe(true);
    expect(isRegional({ ...flag, type: 'region' })).toBe(true);
    expect(isRegional({ ...flag, map: 'pl' } as Card)).toBe(true);
  });
});
