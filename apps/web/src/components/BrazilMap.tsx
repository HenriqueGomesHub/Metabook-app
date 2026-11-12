import { brStates, brStatesByCode } from '../data/content';
import { CountryMap } from './CountryMap';
import type { MapReveal } from './CountryMap';

export type { MapReveal };

/** Small states get their label outside the map, joined by a leader line. */
const CALLOUTS: Record<string, [number, number]> = {
  RN: [600, 152],
  PB: [600, 174],
  PE: [600, 196],
  AL: [600, 218],
  SE: [600, 240],
  ES: [512, 360],
  RJ: [474, 420],
  DF: [410, 284],
};

export const stateByCode = brStatesByCode;

/** States sharing a first area-code digit with `answer`, tinted on reveal. */
export function groupOf(answer: string, digits: Map<string, Set<string>>): Set<string> {
  const mine = digits.get(answer) ?? new Set<string>();
  return new Set(
    [...digits].filter(([, set]) => [...set].some((d) => mine.has(d))).map(([code]) => code),
  );
}

/** Brazil's states with their callout labels; see CountryMap. */
export function BrazilMap(props: {
  reveal?: MapReveal;
  numbers?: Record<string, string[]>;
  onPick(code: string): void;
  onHover(code: string | null): void;
  className?: string;
}) {
  return (
    <CountryMap
      map={brStates}
      label="Map of Brazil with state borders"
      callouts={CALLOUTS}
      {...props}
    />
  );
}
