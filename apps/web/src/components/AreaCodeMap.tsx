import type { Card } from '@metabook/core';
import type { CSSProperties } from 'react';
import { label } from '../app/labels';
import { useRegionMap } from '../app/useRegionMaps';
import { patternKey, regionKeys, regionMainKey } from '@metabook/core';
import { patternOf, placedCodes, zoneAnswer, zoneKeyOf } from '../data/areaCodes';
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
  byArea = false,
}: {
  /** pool code, upper case */
  country: string;
  /**
   * Answered by area: the regions sharing a code's first digit(s) are one area, picked anywhere
   * inside; picks and reveals use the area's answer ("zone:4").
   */
  byArea?: boolean;
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
  const digitCount = patternOf(country)?.digits ?? 1;
  // by area: each region belongs to the group most of its codes are in, named by one region
  const mainKey = byArea ? regionMainKey(country, placed, digitCount) : new Map<string, string>();
  // a region with no code of its own (Nenets, covered by Arkhangelsk's 818) joins its code's area
  if (byArea)
    for (const { code, spans } of placed)
      for (const region of spans ?? [])
        if (!mainKey.has(region)) mainKey.set(region, patternKey(country, code, digitCount));
  const keyRegion = new Map<string, string>();
  for (const [region, key] of [...mainKey].sort(([a], [b]) => a.localeCompare(b)))
    if (!keyRegion.has(key)) keyRegion.set(key, region);
  const zones = byArea
    ? Object.fromEntries([...mainKey].map(([region, key]) => [region, keyRegion.get(key)!]))
    : areaZones(placed);
  const toRegion = (answer: string) => {
    const key = zoneKeyOf(answer);
    return key === undefined ? answer : (keyRegion.get(key) ?? answer);
  };
  const pick = byArea
    ? (region: string) => onPick(zoneAnswer(mainKey.get(region) ?? region))
    : onPick;
  const shown =
    byArea && reveal
      ? {
          answer: toRegion(reveal.answer),
          picked: toRegion(reveal.picked),
          group: new Set<string>(),
        }
      : tinted;
  // every region's codes, shown on the map once answered; an area's code once, on its key region
  const numbers: Record<string, string[]> = {};
  for (const { code, region, spans } of placed) {
    const where = spans?.length && zones[region] === region ? [region] : [region, ...(spans ?? [])];
    for (const r of where) (numbers[r] ??= []).push(code);
  }
  for (const codes of Object.values(numbers)) codes.sort();
  const isBrazil = country === 'BR';
  const map = useRegionMap(isBrazil ? 'br' : country);
  // by area, no region is named on the map, even one without codes (an old island, "RUS+99?")
  if (byArea && map) for (const { code } of map.states) zones[code] ??= code;
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
        reveal={shown}
        // by area, the areas' colours are the answer: every code under every region is noise
        numbers={byArea ? undefined : numbers}
        trail={!byArea}
        zones={zones}
        onPick={pick}
        onHover={onHover}
        className={className}
      />
    </div>
  );
}
