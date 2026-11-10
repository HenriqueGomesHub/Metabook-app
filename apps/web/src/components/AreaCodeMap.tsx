import type { Card } from '@metabook/core';
import type { CSSProperties } from 'react';
import { label } from '../app/labels';
import { useRegionMap } from '../app/useRegionMaps';
import { BrazilMap, digitGroups, groupOf } from './BrazilMap';
import { CountryMap } from './CountryMap';

/**
 * The map an area code is answered on: Brazil's states (with their callout labels), else the
 * country's regions map, the same one "Where in the country" cards use. On reveal the answer, the
 * pick and the regions sharing the code's first digit are tinted.
 */
export function AreaCodeMap({
  country,
  cards,
  reveal,
  onPick,
  onHover,
  className,
}: {
  /** pool code, upper case */
  country: string;
  /** the country's area-code cards, for the digit groups */
  cards: Card[];
  reveal?: { answer: string; picked: string };
  onPick(code: string): void;
  onHover(code: string | null): void;
  className?: string;
}) {
  const own = cards.filter((card) => card.type === 'areacode' && card.country === country);
  const digits = digitGroups(own);
  const tinted = reveal && { ...reveal, group: groupOf(reveal.answer, digits) };
  const isBrazil = country === 'BR';
  const map = useRegionMap(isBrazil ? 'br' : country);
  if (isBrazil) {
    return <BrazilMap reveal={tinted} onPick={onPick} onHover={onHover} className={className} />;
  }
  if (map === undefined) {
    return (
      <p className="map-status" role="status">
        Loading the map…
      </p>
    );
  }
  if (map === null) {
    return (
      <p className="map-status" role="alert">
        The map of {label(country)} could not be loaded.
      </p>
    );
  }
  const [, , width = 640, height = 580] = map.viewBox.split(' ').map(Number);
  return (
    <div className="region-map" style={{ '--map-ar': width / height } as CSSProperties}>
      <CountryMap
        map={map}
        label={`Map of ${label(country)} with region borders`}
        reveal={tinted}
        onPick={onPick}
        onHover={onHover}
        className={className}
      />
    </div>
  );
}
