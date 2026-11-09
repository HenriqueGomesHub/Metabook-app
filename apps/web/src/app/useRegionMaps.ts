import { useEffect, useState } from 'react';
import { loadedRegionMap, loadRegionMap } from '../data/content';

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
