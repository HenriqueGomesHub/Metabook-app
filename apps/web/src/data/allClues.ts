import type { ClueCountry } from '@metabook/core';

// Every content/clues/<code>.json is inlined into this module, and content.ts imports it lazily:
// one request at startup instead of one per country. index.json is the pipeline's summary.
const files = import.meta.glob<ClueCountry>(
  ['../../../../content/clues/*.json', '!../../../../content/clues/index.json'],
  { eager: true, import: 'default' },
);

/** The clue catalogue, in file-name order; empty until the pipeline has written it. */
export const allClues: ClueCountry[] = Object.keys(files)
  .sort()
  .flatMap((path) => {
    const country = files[path];
    return country && Array.isArray(country.clues) ? [country] : [];
  });
