import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkAreaCodePatterns, namedRegions } from '../areacode-patterns.mjs';

const map = {
  states: [
    { code: 'PR', name: 'Paraná' },
    { code: 'PA', name: 'Pará' },
    { code: 'PL', name: 'Lesser Poland Voivodeship' },
  ],
};

describe('area-code patterns', () => {
  it('matches the shipped patterns.json against the codes', () => {
    assert.deepEqual(checkAreaCodePatterns(), []);
  });

  it('reads region names, their short forms and areas from a label, longest first', () => {
    const named = namedRegions('Paraná, Lesser Poland & the Centre', map, { 'the Centre': ['PA'] });
    assert.deepEqual([...named.values()].flat().sort(), ['PA', 'PL', 'PR']);
    // "Pará" is not read inside "Paraná"
    assert.deepEqual([...namedRegions('Paraná', map).keys()], ['parana']);
  });
});
