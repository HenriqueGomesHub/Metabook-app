import type { Card, PoolCountry, Tip } from '@metabook/core';
import brStatesJson from '../../../../content/maps/br-states.json';
import { mediaUrl } from './media';
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
  states: MapRegion[];
}

/** Brazil's hand-made map has a capital for every state. */
export const brStates: Omit<RegionMap, 'states'> & { states: Required<MapRegion>[] } = brStatesJson;

const regionFiles = import.meta.glob<RegionMap>('../../../../content/maps/*-regions.json', {
  eager: true,
  import: 'default',
});

/** Region maps by upper-case country code; Brazil's hand-made map wins. */
export const regionMaps: ReadonlyMap<string, RegionMap> = new Map([
  ...Object.values(regionFiles).map((map): [string, RegionMap] => [map.country.toUpperCase(), map]),
  ['BR', brStates],
]);

const flatten = <T>(files: Record<string, T[]>): T[] => Object.values(files).flat();

const pool = import.meta.glob<PoolCountry[]>('../../../../content/pool.json', {
  eager: true,
  import: 'default',
});
const chapters = import.meta.glob<Chapter[]>('../../../../content/chapters.json', {
  eager: true,
  import: 'default',
});
const cards = import.meta.glob<Card[]>('../../../../content/cards/*.json', {
  eager: true,
  import: 'default',
});
const tips = import.meta.glob<Tip[]>('../../../../content/tips/*.json', {
  eager: true,
  import: 'default',
});

/** Generated photo cards store bucket paths; resolve them against the media base. */
const withMediaUrls = (card: Card): Card =>
  card.prompt.kind === 'image'
    ? { ...card, prompt: { ...card.prompt, value: mediaUrl(card.prompt.value) } }
    : card;

export const bundled: Content = {
  pool: flatten(pool),
  chapters: flatten(chapters),
  cards: flatten(cards).map(withMediaUrls),
  tips: flatten(tips),
};

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

export async function loadContent(repo: Repository): Promise<Content> {
  return mergeOverrides(bundled, await repo.listCardOverrides());
}
