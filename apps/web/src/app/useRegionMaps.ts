import { useEffect, useState } from 'react';
import { loadedRegionMap, loadRegionMap } from '../data/content';
import type { RegionMap } from '../data/content';

/**
 * Fetches the regions maps (lower-case codes) whose state names labels need, re-rendering once
 * they arrive. Until then, or when a map fails to load, labels fall back to the state codes.
 */
export function useRegionMaps(codes: string[]): void {
  const [, setLoaded] = useState(0);
  const missing = codes.filter((code) => !loadedRegionMap(code)).join();
  useEffect(() => {
    if (!missing) return;
    let live = true;
    for (const code of missing.split(',')) {
      loadRegionMap(code).then(
        () => live && setLoaded((n) => n + 1),
        () => undefined, // labels fall back to the codes
      );
    }
    return () => {
      live = false;
    };
  }, [missing]);
}

/** One country's regions map: undefined while it loads, null when it could not be loaded. */
export function useRegionMap(country: string): RegionMap | null | undefined {
  const [map, setMap] = useState<RegionMap | null | undefined>(() => loadedRegionMap(country));
  useEffect(() => {
    if (map && map.country.toLowerCase() === country.toLowerCase()) return;
    let live = true;
    setMap(loadedRegionMap(country));
    loadRegionMap(country).then(
      (loaded) => live && setMap(loaded ?? null),
      () => live && setMap(null),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the country changes
  }, [country]);
  return map;
}
