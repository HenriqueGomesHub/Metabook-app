// content/maps/<code>-regions.json from Natural Earth admin-1, in the shape of br-states.json:
// { country, viewBox, source, states: [{ code, name, path, label, capital? }] }.
// Brazil keeps its hand-made br-states.json.
// CLI: node tools/content/regions.mjs --country pl
import { join } from 'node:path';
import { geoCentroid, geoMercator, geoPath } from 'd3-geo';
import { CONTENT, isMain, isoOf, naturalEarth, parseArgs, poolCountry, writeJson } from './lib/common.mjs';

export const WIDTH = 640;
const PAD = 8;
/** simplification tolerance in output pixels */
const TOLERANCE = 0.6;
/** Natural Earth leaves iso_a2 "-99" for some countries; match their admin-0 code instead. */
const ADM0_A3 = { XK: 'KOS' };

const round = (n) => Math.round(n * 10) / 10;

/** Douglas–Peucker on projected points. */
export function simplify(points, tolerance = TOLERANCE) {
  if (points.length <= 2) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const len = Math.hypot(bx - ax, by - ay);
  let max = -1;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max <= tolerance) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

const rings = (geometry) =>
  geometry.type === 'Polygon' ? geometry.coordinates : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat() : [];

/** SVG path of a geometry, each ring projected, simplified and rounded; specks dropped. */
function pathOf(geometry, projection) {
  return rings(geometry)
    .map((ring) => simplify(ring.map((p) => projection(p))).map(([x, y]) => [round(x), round(y)]))
    .filter((ring) => ring.length >= 3)
    .map((ring) => `M${ring.map(([x, y]) => `${x},${y}`).join('L')}Z`)
    .join('');
}

/** Signed planar area of a lon/lat ring; negative is clockwise. */
const area = (ring) => ring.reduce((sum, [x, y], i) => {
  const [nx, ny] = ring[(i + 1) % ring.length];
  return sum + (x * ny - nx * y);
}, 0) / 2;

/**
 * d3-geo wants exterior rings clockwise and holes anticlockwise (the reverse of RFC 7946);
 * the other way round it reads a region as "the whole globe except it".
 */
export function rewind(geometry) {
  const fix = (polygon) => polygon.map((ring, i) => ((area(ring) < 0) === (i === 0) ? ring : [...ring].reverse()));
  if (geometry.type === 'Polygon') return { ...geometry, coordinates: fix(geometry.coordinates) };
  if (geometry.type === 'MultiPolygon') return { ...geometry, coordinates: geometry.coordinates.map(fix) };
  return geometry;
}

export const regionCode = (props) =>
  (props.iso_3166_2 && !props.iso_3166_2.includes('~') ? props.iso_3166_2.split('-').pop() : null) ||
  props.postal ||
  props.adm1_code;

/**
 * Every state gets a unique, non-empty name: one shape split in two (same code and name) becomes
 * one state; an unnamed state is called by its code; states sharing a name are told apart by
 * Natural Earth's `type` ("Cork (County)" vs "Cork (City)") when theirs is unique among them,
 * else by code ("Sofia (22)"). `type` is dropped from the result.
 */
export function uniqueStateNames(states) {
  const merged = [];
  for (const { type, ...state } of states) {
    const name = state.name?.trim() || state.code;
    const twin = merged.find((m) => m.code === state.code && m.name === name);
    if (twin) {
      twin.path += state.path;
      twin.capital ??= state.capital;
      twin.type ||= type;
    } else merged.push({ ...state, name, type });
  }
  const byName = Map.groupBy(merged, (s) => s.name);
  return merged.map(({ type, ...state }) => {
    const group = byName.get(state.name);
    if (group.length === 1) return state;
    const typeUnique = type && group.filter((s) => s.type === type).length === 1;
    return { ...state, name: `${state.name} (${typeUnique ? type : state.code})` };
  });
}

const norm = (s) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Admin-1 features (and capitals from populated places) → the regions map for one country. */
export function buildRegionMap(code, admin1, places = []) {
  const iso = code.toUpperCase();
  const features = admin1
    .filter((f) => f.properties.iso_a2 === iso || (ADM0_A3[iso] && f.properties.adm0_a3 === ADM0_A3[iso]))
    .map((f) => ({ ...f, geometry: rewind(f.geometry) }));
  if (features.length === 0) throw new Error(`${iso} has no admin-1 regions in Natural Earth`);
  const collection = { type: 'FeatureCollection', features };
  // rotate to the country's centre so nothing straddles the antimeridian
  const projection = geoMercator().rotate([-geoCentroid(collection)[0], 0]).fitWidth(WIDTH - 2 * PAD, collection);
  const [[, y0], [, y1]] = geoPath(projection).bounds(collection);
  const height = Math.ceil(y1 - y0 + 2 * PAD);
  const [tx, ty] = projection.translate();
  projection.translate([tx + PAD, ty - y0 + PAD]);
  const path = geoPath(projection);

  const capitals = places.filter(
    (p) => isoOf(p.properties) === iso && /capital/i.test(p.properties.featurecla ?? ''),
  );
  const states = uniqueStateNames(features
    .map((feature) => {
      const props = feature.properties;
      const name = props.name_en || props.name;
      const [lx, ly] = path.centroid(feature);
      const capital = capitals.find((c) => norm(c.properties.adm1name) === norm(props.name));
      const lonLat = capital && [capital.properties.longitude, capital.properties.latitude];
      return {
        code: regionCode(props),
        name,
        type: props.type_en,
        path: pathOf(feature.geometry, projection),
        label: [Math.round(lx), Math.round(ly)],
        ...(lonLat && {
          capital: { xy: projection(lonLat).map(Math.round), lat: lonLat[1], lon: lonLat[0] },
        }),
      };
    })
    .filter((state) => state.path))
    .sort((a, b) => a.code.localeCompare(b.code));
  return {
    country: iso,
    viewBox: `0 0 ${WIDTH} ${height}`,
    source: `Simplified from Natural Earth ne_10m_admin_1_states_provinces; mercator fitWidth ${WIDTH}`,
    states,
  };
}

export async function buildRegions(code) {
  if (code.toLowerCase() === 'br') return { skipped: 'Brazil keeps br-states.json' };
  const admin1 = await naturalEarth('ne_10m_admin_1_states_provinces.geojson');
  const places = await naturalEarth('ne_10m_populated_places_simple.geojson');
  const map = buildRegionMap(code, admin1.features, places.features);
  writeJson(join(CONTENT, 'maps', `${code.toLowerCase()}-regions.json`), map);
  return {
    regions: map.states.length,
    capitals: map.states.filter((s) => s.capital).length,
    bytes: JSON.stringify(map).length,
  };
}

if (isMain(import.meta)) {
  const code = poolCountry(parseArgs().country).code.toLowerCase();
  console.log(JSON.stringify(await buildRegions(code)));
}
