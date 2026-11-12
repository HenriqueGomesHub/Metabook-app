import { parseMapKey } from '@metabook/core';
import type { Card, CardType, MetaSubject } from '@metabook/core';
import { brStatesByCode, bundled, loadedRegionMap } from '../data/content';

const REGION_NAMES: Record<string, string> = {
  north: 'North',
  northeast: 'Northeast',
  'centre-west': 'Centre-West',
  southeast: 'Southeast',
  south: 'South',
};

const TYPE_NAMES: Record<CardType, string> = {
  flag: 'Flags',
  script: 'Scripts',
  meta: 'Metas',
  lookalike: 'Lookalikes',
  region: 'Regions',
  areacode: 'Area codes',
  plate: 'Plates',
  spot: 'Spot it',
  which: 'Which clue',
  live: 'Live view',
};

/** Drill tiles and auto chapters per meta subject (the clue families). */
export const SUBJECTS: Record<MetaSubject, { label: string; blurb: string }> = {
  bollard: { label: 'Bollards', blurb: 'Roadside posts and their reflectors' },
  pole: { label: 'Poles', blurb: 'Utility poles, their shapes and markings' },
  plate: { label: 'Plates', blurb: 'Licence plate formats and colours' },
  sign: { label: 'Signs', blurb: 'Road sign colours, fonts and shapes' },
  line: { label: 'Road lines', blurb: 'Centre and edge line patterns' },
  guardrail: { label: 'Guardrails', blurb: 'Barriers and their reflectors' },
  language: { label: 'Language', blurb: 'Letters and words on signs' },
  car: { label: 'Google car', blurb: 'The car itself: colour, antenna, rack, follow cars' },
  coverage: { label: 'Coverage', blurb: 'Camera generation, season, trekkers and where it is' },
  street: { label: 'Streets', blurb: 'Kerbs, lamps, bus stops and road surface' },
  landscape: { label: 'Landscape', blurb: 'Terrain, soil and scenery' },
  vegetation: { label: 'Vegetation', blurb: 'Trees, crops and plants' },
  architecture: { label: 'Architecture', blurb: 'Houses, roofs and walls' },
  other: { label: 'Other clues', blurb: 'Driving side, landmarks, traffic, phone numbers' },
};

/** How a family's clues are counted on a tile ("38 bollards"). */
export const FAMILY_NOUNS: Record<MetaSubject, [string, string]> = {
  bollard: ['bollard', 'bollards'],
  pole: ['pole', 'poles'],
  plate: ['plate', 'plates'],
  sign: ['sign', 'signs'],
  line: ['line clue', 'line clues'],
  guardrail: ['guardrail', 'guardrails'],
  language: ['language clue', 'language clues'],
  car: ['car clue', 'car clues'],
  coverage: ['coverage clue', 'coverage clues'],
  street: ['street clue', 'street clues'],
  landscape: ['landscape clue', 'landscape clues'],
  vegetation: ['plant', 'plants'],
  architecture: ['building clue', 'building clues'],
  other: ['clue', 'clues'],
};

export const SUBJECT_ORDER = Object.keys(SUBJECTS) as MetaSubject[];

/** Lower-case code of the regions map whose state codes the keys are ('br': Brazil's states). */
export type Scope = string | undefined;

let countries: Map<string, string> | undefined;

function lookup() {
  // built once the pool has loaded; before that, labels fall back to the raw key
  if (!countries && bundled.pool.length) {
    countries = new Map(bundled.pool.map((country) => [country.code, country.name]));
  }
  return { states: brStatesByCode, countries: countries ?? new Map<string, string>() };
}

/**
 * Human label for any answer or confusion key: region ids, Brazilian state codes,
 * ISO country codes and plain answers (country names) all read naturally.
 * Pass `scope: 'br'` when a two-letter key is a Brazilian state (area codes) rather than a country,
 * or another map's code ('us') for its state codes; those names come from the map once loaded.
 * Map-scoped keys ("ca:NL", what regions-map cards record) resolve on their own map, whatever the
 * scope; until that map has loaded they read as the bare state code.
 */
export function label(key: string, scope?: Scope): string {
  // a map-scoped confusion key ("ca:NL") names its own map
  const scoped = parseMapKey(key);
  if (scoped) return label(scoped.code, scoped.map);
  const region = REGION_NAMES[key];
  if (region) return region;
  const { states, countries } = lookup();
  if (scope === 'br') return states.get(key)?.name ?? countries.get(key) ?? key;
  if (scope) return loadedRegionMap(scope)?.states.find((s) => s.code === key)?.name ?? key;
  return countries.get(key) ?? states.get(key)?.name ?? key;
}

/** Card-type and tag names for headings like "Weakest". */
export function tagLabel(tag: string): string {
  return (
    TYPE_NAMES[tag as CardType] ??
    label(tag)
      .replace(/-/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** Confusion pairs always read "picked / truth" in that order. */
export function pairLabel(picked: string, truth: string, scope?: Scope): string {
  return `${label(picked, scope)} / ${label(truth, scope)}`;
}

/**
 * Regions-map cards answer with their map's state codes, area codes with the state codes of their
 * country's map ('br' for Brazil); everything else is a country name or region id.
 */
export const scopeOf = (card: Pick<Card, 'type' | 'map' | 'country'> | undefined): Scope =>
  card?.map ?? (card?.type === 'areacode' ? (card.country ?? 'BR').toLowerCase() : undefined);
