import type { Card, PoolCountry, Tip } from '@metabook/core';
import brStatesJson from '../../../../content/maps/br-states.json';
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

export interface BrazilState {
  code: string;
  name: string;
  path: string;
  label: number[];
  capital: { xy: number[]; lat: number; lon: number };
}

export interface BrazilMap {
  country: string;
  viewBox: string;
  states: BrazilState[];
}

export const brStates: BrazilMap = brStatesJson;

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

export const bundled: Content = {
  pool: flatten(pool),
  chapters: flatten(chapters),
  cards: flatten(cards),
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
