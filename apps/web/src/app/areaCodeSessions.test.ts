import { describe, expect, it } from 'vitest';
import { bundled, withClueCards } from '../data/content';
import { isMemoriseAreaCode } from '../data/areaCodes';
import type { AppSnapshot } from './AppData';
import { sessionCards } from './stats';

describe('area codes in daily sessions', () => {
  const content = withClueCards(bundled, []);
  const cards = sessionCards({ content } as AppSnapshot);

  it('leaves out countries whose codes follow no pattern (US, Canada)', () => {
    expect(cards.some((c) => c.type === 'areacode' && c.country === 'US')).toBe(false);
    expect(cards.some((c) => c.type === 'areacode' && c.country === 'CA')).toBe(false);
  });

  it('keeps the pattern countries', () => {
    expect(cards.some((c) => c.type === 'areacode' && c.country === 'PL')).toBe(true);
    expect(cards.some((c) => c.type === 'areacode' && c.country === 'BR')).toBe(true);
  });

  it('marks only the no-pattern countries as memorise', () => {
    expect(isMemoriseAreaCode({ type: 'areacode', country: 'US' })).toBe(true);
    expect(isMemoriseAreaCode({ type: 'areacode', country: 'RU' })).toBe(false);
    expect(isMemoriseAreaCode({ type: 'flag', country: 'US' })).toBe(false);
  });
});
