import { describe, expect, it } from 'vitest';
import { matchesAnswer, normalizeAnswer } from './answers';

describe('normalizeAnswer', () => {
  it('folds case, diacritics, punctuation and whitespace', () => {
    expect(normalizeAnswer("  Côte d'Ivoire ")).toBe('cote d ivoire');
    expect(normalizeAnswer('SÃO   PAULO')).toBe('sao paulo');
  });
});

describe('matchesAnswer', () => {
  it('refuses a fuzzy match when the input is another answer in the deck', () => {
    const gambia = { answer: 'Gambia' };
    expect(matchesAnswer('Zambia', gambia)).toBe(true);
    expect(matchesAnswer('Zambia', gambia, ['Zambia'])).toBe(false);
    expect(matchesAnswer('Gambia', gambia, ['Zambia'])).toBe(true);
    expect(matchesAnswer('gambai', gambia, ['Zambia'])).toBe(true);
  });

  const card = { answer: 'Lithuania', aliases: ['Lietuva'] };

  it('accepts the answer and aliases case- and accent-insensitively', () => {
    expect(matchesAnswer(' lithuania ', card)).toBe(true);
    expect(matchesAnswer('LIETUVA', card)).toBe(true);
    expect(matchesAnswer('Paraná', { answer: 'Parana' })).toBe(true);
  });

  it('tolerates one substitution, insertion, deletion or transposition', () => {
    expect(matchesAnswer('Lithuanie', card)).toBe(true);
    expect(matchesAnswer('Lithuannia', card)).toBe(true);
    expect(matchesAnswer('Lthuania', card)).toBe(true);
    expect(matchesAnswer('Lihtuania', card)).toBe(true);
  });

  it('rejects two edits', () => {
    expect(matchesAnswer('Lthuanai', card)).toBe(false);
    expect(matchesAnswer('Latvia', card)).toBe(false);
  });

  it('requires an exact match for answers shorter than 6 characters', () => {
    expect(matchesAnswer('Peru', { answer: 'Peru' })).toBe(true);
    expect(matchesAnswer('Pery', { answer: 'Peru' })).toBe(false);
    expect(matchesAnswer('Bahia', { answer: 'Bahia' })).toBe(true);
    expect(matchesAnswer('Bahai', { answer: 'Bahia' })).toBe(false);
    expect(matchesAnswer('Sergipy', { answer: 'Sergipe' })).toBe(true);
  });

  it('rejects empty input', () => {
    expect(matchesAnswer('  ', { answer: 'Chad' })).toBe(false);
  });
});
