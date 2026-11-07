// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDistanceKm, parseResult, parseScore } from './parser';
import { countryCodeFromName } from './countries';
import { gameTokenFromPath } from './game';

function doc(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
}

const FULL = `
<div data-qa="round-number">Round 3 / 5</div>
<div data-qa="result-view-bottom">
  <div data-qa="correct-country">Côte d'Ivoire</div>
  <div data-qa="guess-country">Ghana</div>
  <div data-qa="distance">Your guess was <b>1,234</b> km from the correct location</div>
  <div data-qa="round-score">4,521 points</div>
</div>`;

describe('parseResult', () => {
  it('returns null when no result screen', () => {
    expect(parseResult(doc('<div data-qa="round-number">Round 1 / 5</div>'))).toBeNull();
  });

  it('parses a full result screen', () => {
    expect(parseResult(doc(FULL))).toEqual({
      roundNumber: 3,
      distanceKm: 1234,
      score: 4521,
      truthCountry: 'CI',
      guessCountry: 'GH',
    });
  });

  it('omits countries when not visible (never fabricates)', () => {
    const p = parseResult(
      doc(`<div data-qa="round-number">Round 1 of 5</div>
      <div data-qa="result-view-bottom"><div data-qa="distance">850 m</div><div data-qa="round-score">5000 points</div></div>`),
    );
    expect(p).toEqual({ roundNumber: 1, distanceKm: 0.85, score: 5000 });
  });

  it('ignores unknown country names', () => {
    const p = parseResult(
      doc(`<div data-qa="result-view-bottom"><div data-qa="correct-country">Narnia</div></div>`),
    );
    expect(p?.truthCountry).toBeUndefined();
  });

  it('does not mutate the document', () => {
    const d = doc(FULL);
    const before = d.documentElement.outerHTML;
    parseResult(d);
    expect(d.documentElement.outerHTML).toBe(before);
  });
});

describe('helpers', () => {
  it('parses distances', () => {
    expect(parseDistanceKm('12.5 km')).toBe(12.5);
    expect(parseDistanceKm('100 mi')).toBeCloseTo(160.934, 2);
    expect(parseDistanceKm('far')).toBeUndefined();
    expect(parseDistanceKm('99,999 km')).toBeUndefined();
  });
  it('parses scores', () => {
    expect(parseScore('4,521 points')).toBe(4521);
    expect(parseScore('9999 points')).toBeUndefined();
    expect(parseScore(undefined)).toBeUndefined();
  });
  it('maps country names', () => {
    expect(countryCodeFromName('United States')).toBe('US');
    expect(countryCodeFromName('  türkiye ')).toBe('TR');
    expect(countryCodeFromName('Atlantis')).toBeUndefined();
  });
  it('extracts game tokens', () => {
    expect(gameTokenFromPath('/game/AbC123xyz')).toBe('AbC123xyz');
    expect(gameTokenFromPath('/maps')).toBeNull();
  });
});
