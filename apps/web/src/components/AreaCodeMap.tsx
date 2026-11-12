import type { Card } from '@metabook/core';
import type { CSSProperties } from 'react';
import { label } from '../app/labels';
import { useRegionMap } from '../app/useRegionMaps';
import { regionKeys } from '@metabook/core';
import { patternOf, placedCodes } from '../data/areaCodes';
import { BrazilMap, groupOf } from './BrazilMap';
import { CountryMap } from './CountryMap';

/**
 * The areas a country's codes are answered by: a code covering several regions (France's 04, 24
 * departments) is one area, picked anywhere inside, since knowing the code means knowing the area,
 * not which of its regions. Region -> the area's key region (the code's own region). A region in
 * two such areas, or the key region of another code, stays on its own, and so does an area left
 * with one region.
 */
export function areaZones(
  placed: { code: string; region: string; spans?: string[] }[],
): Record<string, string> {
  const keys = new Set(placed.map((p) => p.region));
  const seen = new Map<string, string[]>();
  for (const { region, spans } of placed) {
    if (!spans?.length) continue;
    for (const r of new Set([region, ...spans])) seen.set(r, [...(seen.get(r) ?? []), region]);
  }
  const zones: Record<string, string> = {};
  for (const [r, owners] of seen) {
    const [owner] = owners;
    if (owners.length !== 1 || !owner) continue;
    if (r !== owner && keys.has(r)) continue;
    zones[r] = owner;
  }
  // a spanning code's own region is always its area's key, even when another code reaches it
  for (const { region, spans } of placed) if (spans?.length) zones[region] = region;
  // an "area" of one region is just that region
  const size = new Map<string, number>();
  for (const key of Object.values(zones)) size.set(key, (size.get(key) ?? 0) + 1);
  for (const [r, key] of Object.entries(zones)) if ((size.get(key) ?? 0) < 2) delete zones[r];
  return zones;
}

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
  // regions sharing the answer's group: the first significant digit(s), so Italy's "06" is a 6
  const digits = new Map(
    [...regionKeys(country, placedCodes(cards, country), patternOf(country)?.digits ?? 1)].map(
      ([region, keys]) => [region, new Set(keys)],
    ),
  );
  const tinted = reveal && { ...reveal, group: groupOf(reveal.answer, digits) };
  const placed = placedCodes(cards, country);
  const zones = areaZones(placed);
  // every region's codes, shown on the map once answered; an area's code once, on its key region
  const numbers: Record<string, string[]> = {};
  for (const { code, region, spans } of placed) {
    const where = spans?.length && zones[region] === region ? [region] : [region, ...(spans ?? [])];
    for (const r of where) (numbers[r] ??= []).push(code);
  }
  for (const codes of Object.values(numbers)) codes.sort();
  const isBrazil = country === 'BR';
  const map = useRegionMap(isBrazil ? 'br' : country);
  if (isBrazil) {
    return (
      <BrazilMap
        reveal={tinted}
        numbers={numbers}
        onPick={onPick}
        onHover={onHover}
        className={className}
      />
    );
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
        numbers={numbers}
        zones={zones}
        onPick={onPick}
        onHover={onHover}
        className={className}
      />
    </div>
  );
}
