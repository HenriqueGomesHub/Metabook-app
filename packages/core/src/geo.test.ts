import { describe, expect, it } from 'vitest';
import { haversineKm, roundScore } from './geo';

describe('haversineKm', () => {
  it('is 0 for the same point', () => {
    expect(haversineKm({ lat: -15.8, lon: -47.9 }, { lat: -15.8, lon: -47.9 })).toBe(0);
  });

  it('matches a known distance (one degree of longitude at the equator)', () => {
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.19, 1);
  });

  it('is symmetric', () => {
    const a = { lat: -23.55, lon: -46.63 };
    const b = { lat: -3.12, lon: -60.02 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
    expect(haversineKm(a, b)).toBeCloseTo(2690, -1);
  });
});

describe('haversineKm antipodes', () => {
  it('returns about half the circumference, never NaN', () => {
    const d = haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 });
    expect(Number.isNaN(d)).toBe(false);
    expect(d).toBeCloseTo(20015, -1);
    expect(haversineKm({ lat: 90, lon: 0 }, { lat: -90, lon: 0 })).toBeCloseTo(20015, -1);
  });
});

describe('roundScore', () => {
  it('gives 5000 at 0 km', () => {
    expect(roundScore(0, 700)).toBe(5000);
  });

  it('decays exponentially with k', () => {
    expect(roundScore(700, 700)).toBe(Math.round(5000 / Math.E));
    expect(roundScore(100, 700)).toBe(4334);
    expect(roundScore(100, 300)).toBeLessThan(roundScore(100, 700));
  });
});
