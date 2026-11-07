const EARTH_RADIUS_KM = 6371;
const MAX_POINTS = 5000;

export interface LatLon {
  lat: number;
  lon: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** GeoGuessr-style decay: 5000 at 0 km, falling with scale `k` km (700 for Brazil). */
export function roundScore(km: number, k: number): number {
  return Math.round(MAX_POINTS * Math.exp(-km / k));
}
