import type { CardType, MetaSubject } from '@metabook/core';
import { brStates, bundled } from '../data/content';

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
  'photo-choice': 'Photo picks',
};

/** Drill tiles and auto chapters per meta subject. */
export const SUBJECTS: Record<MetaSubject, { label: string; blurb: string }> = {
  bollard: { label: 'Bollards', blurb: 'Roadside posts and their reflectors' },
  pole: { label: 'Poles', blurb: 'Utility poles, their shapes and markings' },
  plate: { label: 'Plates', blurb: 'Licence plate formats and colours' },
  sign: { label: 'Signs', blurb: 'Road sign colours, fonts and shapes' },
  line: { label: 'Road lines', blurb: 'Centre and edge line patterns' },
  guardrail: { label: 'Guardrails', blurb: 'Barriers and their reflectors' },
  language: { label: 'Language', blurb: 'Letters and words on signs' },
  car: { label: 'Google car', blurb: 'Car, camera and coverage clues' },
  landscape: { label: 'Landscape', blurb: 'Terrain, vegetation and soil' },
  architecture: { label: 'Architecture', blurb: 'Houses, roofs and pavements' },
  other: { label: 'Basics', blurb: 'Driving side, domains, calling codes' },
};

export const SUBJECT_ORDER = Object.keys(SUBJECTS) as MetaSubject[];

type Scope = 'br' | undefined;

let names: { states: Map<string, string>; countries: Map<string, string> } | undefined;

function lookup() {
  names ??= {
    states: new Map((brStates?.states ?? []).map((state) => [state.code, state.name])),
    countries: new Map((bundled?.pool ?? []).map((country) => [country.code, country.name])),
  };
  return names;
}

/**
 * Human label for any answer or confusion key: region ids, Brazilian state codes,
 * ISO country codes and plain answers (country names) all read naturally.
 * Pass `scope: 'br'` when a two-letter key is a Brazilian state (area codes) rather than a country.
 */
export function label(key: string, scope?: Scope): string {
  const region = REGION_NAMES[key];
  if (region) return region;
  const { states, countries } = lookup();
  if (scope === 'br') return states.get(key) ?? countries.get(key) ?? key;
  return countries.get(key) ?? states.get(key) ?? key;
}

/** Card-type and tag names for headings like "Weakest". */
export function tagLabel(tag: string): string {
  return TYPE_NAMES[tag as CardType] ?? label(tag).replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Confusion pairs always read "picked / truth" in that order. */
export function pairLabel(picked: string, truth: string, scope?: Scope): string {
  return `${label(picked, scope)} / ${label(truth, scope)}`;
}

/** Area-code answers are Brazilian state codes; everything else is a country name or region id. */
export const scopeOf = (type: CardType | undefined): Scope => (type === 'areacode' ? 'br' : undefined);
