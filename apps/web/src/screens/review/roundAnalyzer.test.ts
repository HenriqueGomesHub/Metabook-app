import { describe, expect, it } from 'vitest';
import { mapAnalyzerRounds } from './roundAnalyzer';

describe('mapAnalyzerRounds', () => {
  it('maps nested actual/guess objects and derives the distance from coordinates', () => {
    const { rounds, skipped } = mapAnalyzerRounds([
      {
        actual: { lat: 54.68, lng: 25.28, countryCode: 'lt' },
        guess: { lat: 56.95, lng: 24.1, countryCode: 'LV' },
        score: 3456,
        timestamp: '2026-03-02T18:30:00Z',
        mapName: 'A Community World',
        movement: 'No Move',
      },
    ]);
    expect(skipped).toBe(0);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({
      source: 'import',
      playedAt: '2026-03-02T18:30:00.000Z',
      map: 'A Community World',
      mode: 'nm',
      score: 3456,
      truth: { country: 'LT', lat: 54.68, lon: 25.28 },
      guess: { country: 'LV', lat: 56.95, lon: 24.1 },
    });
    expect(rounds[0]?.distanceKm).toBeGreaterThan(200);
    expect(rounds[0]?.distanceKm).toBeLessThan(300);
  });

  it('maps flat snake_case fields in a {rounds} wrapper with metres and unix seconds', () => {
    const { rounds } = mapAnalyzerRounds({
      rounds: [
        {
          actual_country_code: 'BR',
          guess_country_code: 'AR',
          distance: 1_250_000,
          points: '2100',
          date: 1_772_476_200,
          mode: 'moving',
        },
      ],
    });
    expect(rounds[0]).toMatchObject({
      truth: { country: 'BR' },
      guess: { country: 'AR' },
      distanceKm: 1250,
      score: 2100,
      mode: 'move',
      playedAt: '2026-03-02T18:30:00.000Z',
    });
  });

  it('reads GeoGuessr style distance objects and forbid flags', () => {
    const { rounds } = mapAnalyzerRounds([
      {
        truth: { countryCode: 'PL' },
        player: { country: 'CZ' },
        distance: { meters: { amount: '412.5', unit: 'km' } },
        forbidMoving: true,
        forbidZooming: true,
        forbidRotating: true,
      },
    ]);
    expect(rounds[0]).toMatchObject({ distanceKm: 412.5, mode: 'nmpz' });
  });

  it('skips rounds without country codes on both sides and counts them', () => {
    const result = mapAnalyzerRounds([
      { actual: { countryCode: 'FR' }, guess: { countryCode: 'BE' } },
      { actual: { lat: 1, lng: 2 }, guess: { countryCode: 'BE' } },
      { actual: { country: 'France' }, guess: { country: 'Belgium' } },
      'not a round',
    ]);
    expect(result.rounds).toHaveLength(1);
    expect(result.skipped).toBe(3);
  });

  it('rejects an unknown shape', () => {
    expect(() => mapAnalyzerRounds({ hello: 'world' })).toThrow(/Round Analyzer/);
    expect(() => mapAnalyzerRounds('x')).toThrow();
  });
});
