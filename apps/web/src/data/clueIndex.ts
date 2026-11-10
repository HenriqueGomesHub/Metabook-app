import type { Clue, ClueCountry } from '@metabook/core';
import { visibleClues } from './content';
import type { Content } from './content';

export interface ClueIndex {
  /** the catalogue with overrides applied (hidden images left out) */
  countries: ClueCountry[];
  byCountry: Map<string, ClueCountry>;
  byId: Map<string, Clue>;
}

const indexes = new WeakMap<Content, ClueIndex>();

/** Lookups over the visible catalogue, built once per content object. */
export function clueIndex(content: Content): ClueIndex {
  let index = indexes.get(content);
  if (!index) {
    const countries = visibleClues(content);
    index = {
      countries,
      byCountry: new Map(countries.map((c) => [c.country.toUpperCase(), c])),
      byId: new Map(countries.flatMap((c) => c.clues.map((clue) => [clue.id, clue] as const))),
    };
    indexes.set(content, index);
  }
  return index;
}
