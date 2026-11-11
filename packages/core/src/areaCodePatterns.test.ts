import { describe, expect, it } from 'vitest';
import {
  patternGroups,
  patternHint,
  patternKey,
  regionKeys,
  regionMainKey,
  significantDigits,
} from './areaCodePatterns';
import type { AreaCodePattern } from './areaCodePatterns';

describe('patternKey', () => {
  it('ignores a trunk 0', () => {
    expect(patternKey('IT', '06')).toBe('6');
    expect(patternKey('AU', '02')).toBe('2');
    expect(patternKey('ID', '021')).toBe('2');
    expect(patternKey('TR', '0212', 2)).toBe('21');
  });

  it('reads Colombia by its third digit and Spain by its second', () => {
    expect(significantDigits('CO', '601')).toBe('1');
    expect(patternKey('CO', '608')).toBe('8');
    expect(patternKey('ES', '91')).toBe('1');
    expect(patternKey('ES', '881')).toBe('8');
  });

  it('takes the first digit elsewhere', () => {
    expect(patternKey('RU', '495')).toBe('4');
    expect(patternKey('RU', '495', 2)).toBe('49');
    expect(patternKey('BR', '41')).toBe('4');
    expect(patternKey('MX', '55')).toBe('5');
  });
});

const italy = [
  { code: '06', region: 'RM' },
  { code: '0773', region: 'LT' },
  { code: '0775', region: 'RM' },
  { code: '02', region: 'MI' },
];

describe('patternGroups', () => {
  it('groups codes by key with their regions, share and written form', () => {
    expect(patternGroups('IT', italy)).toEqual([
      { key: '2', regions: ['MI'], share: 0.25, form: '02' },
      { key: '6', regions: ['RM'], share: 0.25, form: '06' },
      { key: '7', regions: ['LT', 'RM'], share: 0.5, form: '07x' },
    ]);
  });

  it('writes Spain’s mirrored 9/8 codes together', () => {
    const groups = patternGroups('ES', [
      { code: '91', region: 'M' },
      { code: '81', region: 'M' },
      { code: '954', region: 'SE' },
    ]);
    expect(groups.map((g) => g.form)).toEqual(['91 · 81', '95x']);
  });

  it('lists a region in every group its codes fall in, its main group first by count', () => {
    expect(regionKeys('IT', italy).get('RM')).toEqual(['6', '7']);
    expect(regionMainKey('IT', [...italy, { code: '0766', region: 'RM' }]).get('RM')).toBe('7');
  });
});

describe('patternHint', () => {
  const brazil: AreaCodePattern = {
    kind: 'pattern',
    digits: 1,
    hook: 'h',
    summary: 's',
    groups: [{ key: '4', label: 'Paraná & Santa Catarina' }],
  };
  const codes = [
    { code: '41', region: 'PR' },
    { code: '47', region: 'SC' },
    { code: '11', region: 'SP' },
  ];

  it('names the code’s group', () => {
    expect(patternHint('BR', '47', brazil, codes)).toBe('4x = Paraná & Santa Catarina');
  });

  it('says nothing without a pattern or a labelled group', () => {
    expect(patternHint('BR', '11', brazil, codes)).toBeUndefined();
    expect(patternHint('US', '212', { ...brazil, kind: 'memorise' }, codes)).toBeUndefined();
    expect(patternHint('BR', '41', undefined, codes)).toBeUndefined();
  });
});

describe('patternHint for a country with no pattern', () => {
  it('lists the other codes of the same region', () => {
    const us = { kind: 'memorise' as const, digits: 1, hook: '', summary: '', groups: [] };
    const codes = [
      { code: '201', region: 'NJ' },
      { code: '551', region: 'NJ' },
      { code: '862', region: 'NJ' },
      { code: '212', region: 'NY' },
    ];
    expect(patternHint('US', '201', us, codes)).toBe('Same region = 551, 862');
    expect(patternHint('US', '212', us, codes)).toBeUndefined();
  });
});
