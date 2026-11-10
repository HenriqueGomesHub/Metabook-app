import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLUE_COUNTRIES, CLUE_NAMES, CLUE_POOL } from './__fixtures__/clues';
import { clueCards, usableImage } from './clueCards';
import type { ClueCountry } from './clues';
import { clueTexts, expandCatalogue, slimCatalogue } from './clueSlim';
import type { PoolCountry } from './types';

/** What the slim form drops: text on clues with a drillable image, and tags. */
const withoutText = (countries: ClueCountry[]): ClueCountry[] =>
  countries.map((country) => ({
    ...country,
    clues: country.clues.map((clue) => ({
      ...clue,
      tags: [],
      text: clue.images.some(usableImage) ? [] : clue.text,
    })),
  }));

const roundTrip = (countries: ClueCountry[]) =>
  expandCatalogue(JSON.parse(JSON.stringify(slimCatalogue(countries))));

describe('slimCatalogue', () => {
  it('round-trips the catalogue minus the text the app loads later', () => {
    expect(roundTrip(CLUE_COUNTRIES)).toEqual(withoutText(CLUE_COUNTRIES));
  });

  it('builds the same cards from the slim catalogue as from the full one', () => {
    const full = clueCards({ clues: CLUE_COUNTRIES, pool: CLUE_POOL, names: CLUE_NAMES });
    const slim = clueCards({
      clues: roundTrip(CLUE_COUNTRIES),
      pool: CLUE_POOL,
      names: CLUE_NAMES,
    });
    expect(slim.map((c) => c.id)).toEqual(full.map((c) => c.id));
    expect(slim).toEqual(full);
  });

  it('keeps every clue text in clueTexts', () => {
    const country = CLUE_COUNTRIES[0] as ClueCountry;
    const texts = clueTexts(country);
    for (const clue of country.clues) expect(texts[clue.id]).toEqual(clue.text);
  });

  it('builds the same card ids from the shipped catalogue', () => {
    const dir = new URL('../../../content/clues/', import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');
    const read = <T>(path: URL) => JSON.parse(readFileSync(path, 'utf8')) as T;
    const shipped = files.sort().map((f) => read<ClueCountry>(new URL(f, dir)));
    const pool = read<PoolCountry[]>(new URL('../pool.json', dir));
    const back = roundTrip(shipped);
    expect(back).toEqual(withoutText(shipped));
    const ids = (clues: ClueCountry[]) => clueCards({ clues, pool }).map((c) => c.id);
    expect(ids(back)).toEqual(ids(shipped));
  });
});
