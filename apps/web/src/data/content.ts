import { applyClueOverrides, clueCards } from '@metabook/core';
import type { Card, ClueCountry, ClueImageOverride, PoolCountry, Tip } from '@metabook/core';
import countryNames from 'virtual:country-names';
import { areaCodeCards } from './areaCodes';
import type { AreaCodeFile } from './areaCodes';
import type { CardOverride, Repository } from './repository';

export interface Chapter {
  id: string;
  country: string;
  order: number;
  title: string;
  subtitle: string;
}

export interface Content {
  pool: PoolCountry[];
  chapters: Chapter[];
  cards: Card[];
  tips: Tip[];
  /** the clue catalogue as shipped (content/clues), before image overrides */
  clues: ClueCountry[];
  /** the admin's corrections to clue images (clue_image_overrides) */
  clueOverrides: ClueImageOverride[];
}

/** One region of a country map; `capital` is optional for generated maps. */
export interface MapRegion {
  code: string;
  name: string;
  path: string;
  label: number[];
  capital?: { xy: number[]; lat: number; lon: number };
}

/** content/maps/br-states.json and the generated <code>-regions.json files share this shape. */
export interface RegionMap {
  country: string;
  viewBox: string;
  /** frames round far islands drawn apart from the mainland (Azores, Hawaii…), in viewBox units */
  insets?: { x: number; y: number; w: number; h: number }[];
  states: MapRegion[];
}

type BrStates = Omit<RegionMap, 'states'> & { states: Required<MapRegion>[] };

/** Brazil's hand-made map has a capital for every state. Filled in place by `loadBundled`. */
export const brStates: BrStates = { country: 'BR', viewBox: '', states: [] };

/** Brazilian states by UF code. Filled in place by `loadBundled`. */
export const brStatesByCode = new Map<string, Required<MapRegion>>();

// Non-eager globs: every JSON file becomes its own lazy, cacheable chunk.
const brStatesFile = import.meta.glob<BrStates>('../../../../content/maps/br-states.json', {
  import: 'default',
});
const regionFiles = import.meta.glob<RegionMap>('../../../../content/maps/*-regions.json', {
  import: 'default',
});

/** Region maps fetched so far, by lower-case code, for synchronous lookups such as labels. */
const loadedMaps = new Map<string, RegionMap>();

/** One country's region map, fetched on demand; undefined when there is none. */
export async function loadRegionMap(country: string): Promise<RegionMap | undefined> {
  const code = country.toLowerCase();
  if (code === 'br') {
    await loadBundled();
    return brStates;
  }
  const map = await regionFiles[`../../../../content/maps/${code}-regions.json`]?.();
  if (map) loadedMaps.set(code, map);
  return map;
}

/** A region map `loadRegionMap` has already fetched (Brazil's once content is loaded). */
export function loadedRegionMap(country: string): RegionMap | undefined {
  const code = country.toLowerCase();
  if (code === 'br') return brStates.states.length > 0 ? brStates : undefined;
  return loadedMaps.get(code);
}

const pool = import.meta.glob<PoolCountry[]>('../../../../content/pool.json', {
  import: 'default',
});
const chapters = import.meta.glob<Chapter[]>('../../../../content/chapters.json', {
  import: 'default',
});
// Hand-written card files are a chunk each; the generated ones come as one chunk (generatedCards.ts).
const cards = import.meta.glob<Card[]>(
  ['../../../../content/cards/*.json', '!../../../../content/cards/generated-*.json'],
  { import: 'default' },
);
const loadGenerated = async () => (await import('./generatedCards')).generatedCards;
const tips = import.meta.glob<Tip[]>('../../../../content/tips/*.json', { import: 'default' });
// Telephone area codes per country (content/areacodes/<code>.json); none is fine.
const areaCodes = import.meta.glob<AreaCodeFile>(
  ['../../../../content/areacodes/*.json', '!../../../../content/areacodes/patterns.json'],
  { import: 'default' },
);
const loadClues = async () => (await import('./allClues')).allClues;

const loadAll = async <T>(files: Record<string, () => Promise<T[]>>): Promise<T[]> =>
  (await Promise.all(Object.values(files).map((load) => load()))).flat();

/** The shipped content. Empty until `loadBundled` resolves, which happens before the app renders. */
export const bundled: Content = {
  pool: [],
  chapters: [],
  cards: [],
  tips: [],
  clues: [],
  clueOverrides: [],
};

let loading: Promise<void> | undefined;

/** Fetches the content chunks once and fills `bundled` and `brStates` in place. */
export function loadBundled(): Promise<void> {
  loading ??= (async () => {
    const [poolItems, chapterItems, cardItems, generated, tipItems, br, clueItems, codeFiles] =
      await Promise.all([
        loadAll(pool),
        loadAll(chapters),
        loadAll(cards),
        loadGenerated(),
        loadAll(tips),
        Object.values(brStatesFile)[0]!(),
        loadClues(),
        Promise.all(Object.values(areaCodes).map((load) => load())),
      ]);
    Object.assign(brStates, br);
    brStatesByCode.clear();
    for (const state of br.states) brStatesByCode.set(state.code, state);
    bundled.pool = poolItems;
    bundled.chapters = chapterItems;
    const shipped = [...cardItems, ...generated];
    const codes = areaCodeCards(
      codeFiles,
      poolItems,
      shipped.map((card) => card.id),
    );
    bundled.cards = [...shipped, ...codes];
    bundled.tips = tipItems;
    bundled.clues = clueItems;
  })().catch((error: unknown) => {
    loading = undefined; // let a retry fetch again
    throw error;
  });
  return loading;
}

function applyOverrides<T extends { id: string }>(items: T[], overrides: T[]): T[] {
  const byId = new Map(overrides.map((item) => [item.id, item]));
  const merged = items.map((item) => byId.get(item.id) ?? item);
  const known = new Set(items.map((item) => item.id));
  return [...merged, ...overrides.filter((item) => !known.has(item.id))];
}

/** An override replaces the bundled item with the same id; unknown ids are added. */
export function mergeOverrides(base: Content, overrides: CardOverride[]): Content {
  const overriddenCards: Card[] = [];
  const overriddenTips: Tip[] = [];
  for (const override of overrides) {
    if (override.kind === 'card') overriddenCards.push(override.data);
    else overriddenTips.push(override.data);
  }
  return {
    ...base,
    cards: applyOverrides(base.cards, overriddenCards),
    tips: applyOverrides(base.tips, overriddenTips),
  };
}

/** The catalogue as drills and Learn show it: crops applied, hidden images left out. */
export const visibleClues = (content: Pick<Content, 'clues' | 'clueOverrides'>): ClueCountry[] =>
  applyClueOverrides(content.clues, content.clueOverrides);

/** Bundled content plus the cards made from the clue catalogue with these image overrides. */
export function withClueCards(base: Content, clueOverrides: ClueImageOverride[]): Content {
  const made = clueCards({
    clues: applyClueOverrides(base.clues, clueOverrides),
    pool: base.pool,
    names: countryNames,
  });
  return { ...base, cards: [...base.cards, ...made], clueOverrides };
}

export async function loadContent(repo: Repository): Promise<Content> {
  await loadBundled();
  const [overrides, clueOverrides] = await Promise.all([
    repo.listCardOverrides(),
    repo.listClueImageOverrides().catch(() => []),
  ]);
  return mergeOverrides(withClueCards(bundled, clueOverrides), overrides);
}
