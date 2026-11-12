import { describe, expect, it } from 'vitest';
import { areaZones } from './AreaCodeMap';

describe('areaZones', () => {
  it('makes each code covering several regions one area, keyed by the code’s own region', () => {
    const zones = areaZones([
      { code: '01', region: '75', spans: ['92', '93'] },
      { code: '02', region: '44', spans: ['35'] },
      { code: '81', region: 'LU' },
      // spills into a region that is another code's own: no area left
      { code: '82', region: 'PD', spans: ['LU'] },
    ]);
    expect(zones).toEqual({ '75': '75', '92': '75', '93': '75', '44': '44', '35': '44' });
  });

  it('leaves alone a region two areas share, and another code’s own region', () => {
    const zones = areaZones([
      { code: '1', region: 'A', spans: ['X', 'B'] },
      { code: '2', region: 'B', spans: ['X', 'C'] },
    ]);
    // X is in both areas and B is code 2's own region, which leaves code 1 no area beyond A
    expect(zones).toEqual({ B: 'B', C: 'B' });
  });
});
