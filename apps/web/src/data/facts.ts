import type { CountryFacts, FactNote } from '@metabook/core';

// One lazy chunk per content/facts/<code>.json, fetched when its Country page opens.
const files = import.meta.glob<CountryFacts>('../../../../content/facts/*.json', {
  import: 'default',
});

/** A country's verified notes, the Learn list's material; empty when it has no facts file. */
export async function loadNotes(country: string): Promise<FactNote[]> {
  const load = files[`../../../../content/facts/${country.toLowerCase()}.json`];
  if (!load) return [];
  const facts = await load();
  return facts.notes.filter((note) => note.verified);
}
