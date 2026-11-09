import type { Card } from '@metabook/core';
import { describe, expect, it } from 'vitest';
import { mapsOf, pairScope } from './stats';

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
