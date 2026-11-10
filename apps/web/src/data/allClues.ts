import { expandCatalogue } from '@metabook/core';
import type { ClueCountry } from '@metabook/core';
import catalogue from 'virtual:clue-catalogue';

// The clue catalogue without its text (see core's clueSlim and the Vite config), one chunk that
// content.ts imports lazily. Clue text comes per country from clueText.ts.

/** The clue catalogue, in file-name order; empty until the pipeline has written it. */
export const allClues: ClueCountry[] = expandCatalogue(catalogue);
