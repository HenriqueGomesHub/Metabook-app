import type { LastRound } from './messages';

/** Builds <base>/round?truth=&guess=&region=&lat=&lng= with only the params that exist. Pure. */
export function buildRoundUrl(baseUrl: string, round: LastRound): string {
  const url = new URL('/round', baseUrl);
  const set = (key: string, value: string | undefined) => {
    if (value) url.searchParams.set(key, value);
  };
  set('truth', round.truth);
  set('guess', round.guess);
  set('region', round.region?.trim());
  if (round.lat !== undefined && Number.isFinite(round.lat)) set('lat', String(round.lat));
  if (round.lng !== undefined && Number.isFinite(round.lng)) set('lng', String(round.lng));
  return url.toString();
}
