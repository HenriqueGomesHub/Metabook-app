import type { Card } from '@metabook/core';

// Every content/cards/generated-<code>.json (about one per country) is inlined into this module,
// and content.ts imports the module lazily: one request at startup instead of one per country.
const files = import.meta.glob<Card[]>('../../../../content/cards/generated-*.json', {
  eager: true,
  import: 'default',
});

/** All generated cards, in file-name order. */
export const generatedCards: Card[] = Object.keys(files)
  .sort()
  .flatMap((path) => files[path] ?? []);
