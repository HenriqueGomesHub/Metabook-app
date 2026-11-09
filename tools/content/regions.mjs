// content/maps/<code>-regions.json from Natural Earth admin-1, in the shape of br-states.json:
// { country, viewBox, source, insets?, states: [{ code, name, path, label, capital? }] }.
// Places GeoGuessr counts as other countries are left out (EXCLUDE); far islands that would
// shrink the mainland are drawn in framed insets, the US on Albers USA.
// Brazil keeps its hand-made br-states.json.
// CLI: node tools/content/regions.mjs --country pl
import { join } from 'node:path';
import {
  geoAlbersUsa,
  geoArea,
  geoAzimuthalEquidistant,
  geoCentroid,
  geoConicConformal,
  geoMercator,
  geoPath,
} from 'd3-geo';
import { CONTENT, contains, isMain, isoOf, naturalEarth, parseArgs, poolCountry, writeJson } from './lib/common.mjs';

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

const norm = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Left off a country's map: places GeoGuessr counts as another country (Réunion, Svalbard, the
 * Caribbean Netherlands…) and remote islands with no coverage. `regions` are region codes;
 * `areas` are [west, south, east, north] boxes that drop every polygon whose centroid is inside.
 */
export const EXCLUDE = {
  // Macquarie Island; Ashmore and Cartier Islands
  AU: { regions: ['AUS+00?', 'ATC+00?'] },
  // Sala y Gómez (part of Valparaíso; Easter Island gets an inset)
  CL: { areas: [[-105.6, -26.6, -105.2, -26.3]] },
  // the far cays of San Andrés y Providencia (Roncador, Serrana, Quitasueño, Serranilla, Bajo Nuevo)
  CO: { areas: [[-81.2, 13.5, -78, 16.5]] },
  // the overseas regions; Réunion is its own pool entry
  FR: { regions: ['GF', 'GP', 'MQ', 'RE', 'YT'] },
  // Minami-Torishima (part of Tokyo)
  JP: { areas: [[150, 20, 160, 30]] },
  // Bonaire, Saba, Sint Eustatius
  NL: { regions: ['BQ1', 'BQ2', 'BQ3'] },
  // Svalbard, Bouvet Island; Jan Mayen (part of Nordland)
  NO: { regions: ['21', 'BVT+00?'], areas: [[-10, 70, -7, 72]] },
  // Kermadec, Antipodes, Campbell, Auckland and Snares Islands
  NZ: { regions: ['NZL-5471', 'NZL-5477', 'NZL-5478', 'NZL-5479', 'NZL-5480'] },
  // Savage Islands (part of Madeira)
  PT: { areas: [[-16.2, 29.9, -15.7, 30.3]] },
  // Prince Edward Islands (part of Western Cape)
  ZA: { areas: [[37, -47.5, 38.5, -46.5]] },
};

const EARTH_KM = 6371;
/** a polygon is far from the main cluster beyond this share of the cluster's diagonal… */
const FAR_SHARE = 0.2;
/** …and beyond this many km */
const FAR_MIN_KM = 50;
/** far parts of one region stay in one inset up to this share of the main diagonal apart */
const SAME_REGION_SHARE = 0.5;
const SAME_REGION_MIN_KM = 300;
/** a far group smaller than this, of regions drawn elsewhere anyway, is left out */
const SPECK_KM2 = 10;
/** a far group this big next to the main cluster is drawn in place, not in an inset */
const INSET_MAX_AREA_SHARE = 0.25;
/** the largest inset box: up to this wide, and 128 px or a fifth of the map tall, at most as tall as it may be wide */
const INSET_MAX_WIDTH = 240;
const INSET_MIN = 28;
/** px of the longer side of an inset's content, at least */
const INSET_MIN_CONTENT = 40;
/** px of the longer side of an inset's biggest island, at least */
const INSET_MIN_ISLAND = 16;
const INSET_PAD = 4;
/** gap kept between an inset frame and the map or another frame */
const INSET_GAP = 6;
const CELL = 4;

const polygonsOf = (geometry) =>
  geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
const multi = (polygons) => ({ type: 'MultiPolygon', coordinates: polygons });

/** Every polygon of the country's features not excluded, with its feature index, area and centroid. */
export function partsOf(features, exclude = {}) {
  const regions = new Set(exclude.regions ?? []);
  const inArea = ([x, y]) => (exclude.areas ?? []).some(([w, s, e, n]) => x >= w && x <= e && y >= s && y <= n);
  return features.flatMap((feature, index) =>
    regions.has(regionCode(feature.properties))
      ? []
      : polygonsOf(feature.geometry)
          .map((polygon) => ({ index, polygon, area: geoArea({ type: 'Polygon', coordinates: polygon }) }))
          .map((part) => ({ ...part, centroid: geoCentroid({ type: 'Polygon', coordinates: part.polygon }) }))
          .filter((part) => !inArea(part.centroid)),
  );
}

const emptyBox = () => [Infinity, Infinity, -Infinity, -Infinity];
const growBox = (b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
const unionBox = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const diagonal = (b) => Math.hypot(b[2] - b[0], b[3] - b[1]);

/** Points within `radius` of each other, bucketed in a grid of that size. */
class PointGrid {
  constructor(radius) {
    this.radius = radius;
    this.cells = new Map();
  }
  key(x, y) {
    return `${Math.floor(x / this.radius)},${Math.floor(y / this.radius)}`;
  }
  add([x, y], tag) {
    const key = this.key(x, y);
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key).push([x, y, tag]);
  }
  /** tags of the points within `radius` of [x, y] */
  near([x, y], radius = this.radius) {
    const cx = Math.floor(x / this.radius);
    const cy = Math.floor(y / this.radius);
    const tags = new Set();
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const [px, py, tag] of this.cells.get(`${cx + i},${cy + j}`) ?? [])
          if (Math.hypot(px - x, py - y) <= radius) tags.add(tag);
    return tags;
  }
}

/**
 * Splits parts into the main cluster (the largest polygon plus everything within reach of it,
 * growing as it goes) and groups of far-away parts, each to be drawn in its own inset. A far
 * group too big next to the main cluster (peninsular Malaysia next to Borneo) joins the cluster;
 * a far speck of a region drawn elsewhere (Rockall) is dropped.
 * Returns { main: part indexes, insets: [part indexes], dropped: part indexes }.
 */
export function clusterParts(parts) {
  if (parts.length === 0) return { main: [], insets: [], dropped: [] };
  const biggest = parts.reduce((a, b) => (b.area > a.area ? b : a));
  // planar km around the biggest polygon, good enough to measure gaps
  const plane = geoAzimuthalEquidistant()
    .rotate([-biggest.centroid[0], -biggest.centroid[1]])
    .scale(EARTH_KM)
    .translate([0, 0]);
  const points = parts.map((part) => {
    const ring = part.polygon[0];
    const step = Math.max(1, Math.floor(ring.length / 400));
    return ring.filter((_, i) => i % step === 0).map((p) => plane(p));
  });
  const boxes = points.map((pts) => pts.reduce(growBox, emptyBox()));
  const area = (indexes) => indexes.reduce((s, i) => s + parts[i].area, 0);

  const inMain = new Set([parts.indexOf(biggest)]);
  let box = boxes[parts.indexOf(biggest)];
  const reach = () => Math.max(FAR_SHARE * diagonal(box), FAR_MIN_KM);
  const join = (i) => {
    inMain.add(i);
    box = unionBox(box, boxes[i]);
  };
  for (;;) {
    for (let changed = true; changed; ) {
      changed = false;
      const grid = new PointGrid(reach());
      for (const i of inMain) for (const p of points[i]) grid.add(p, i);
      for (let i = 0; i < parts.length; i++) {
        if (inMain.has(i) || !points[i].some((p) => grid.near(p).size > 0)) continue;
        join(i);
        for (const p of points[i]) grid.add(p, i);
        changed = true;
      }
    }
    const groups = farGroups(parts, points, inMain, reach(), Math.max(SAME_REGION_SHARE * diagonal(box), SAME_REGION_MIN_KM));
    const big = groups.filter((g) => area(g) >= INSET_MAX_AREA_SHARE * area([...inMain]));
    if (big.length > 0) {
      big.flat().forEach(join);
      continue;
    }
    const mainRegions = new Set([...inMain].map((i) => parts[i].index));
    const speck = (g) => area(g) * EARTH_KM ** 2 < SPECK_KM2 && g.every((i) => mainRegions.has(parts[i].index));
    return {
      main: [...inMain].sort((a, b) => a - b),
      insets: groups.filter((g) => !speck(g)),
      dropped: groups.filter(speck).flat(),
    };
  }
}

/** Far parts in neighbourhoods: within `reach` of each other, or `sameReach` for one region's parts. Largest first. */
function farGroups(parts, points, inMain, reach, sameReach) {
  const far = parts.map((_, i) => i).filter((i) => !inMain.has(i));
  const parent = new Map(far.map((i) => [i, i]));
  const root = (i) => (parent.get(i) === i ? i : root(parent.get(i)));
  const grid = new PointGrid(Math.max(sameReach, reach));
  for (const i of far) for (const p of points[i]) grid.add(p, i);
  for (const i of far)
    for (const p of points[i])
      for (const j of grid.near(p))
        if (root(i) !== root(j) && (parts[i].index === parts[j].index || grid.near(p, reach).has(j)))
          parent.set(root(i), root(j));
  const area = (g) => g.reduce((s, i) => s + parts[i].area, 0);
  return [...Map.groupBy(far, root).values()].map((g) => g.sort((a, b) => a - b)).sort((a, b) => area(b) - area(a));
}

/**
 * Wide, high-latitude countries (Russia, Canada, Kazakhstan…) get a conic projection; the rest a
 * Mercator. Both are rotated to the country's centre so nothing straddles the antimeridian.
 */
export function mainProjection(geometry) {
  const [lon0] = geoCentroid(geometry);
  let [west, east, south, north] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const polygon of polygonsOf(geometry))
    for (const [lon, lat] of polygon[0]) {
      const x = ((lon - lon0 + 540) % 360) - 180;
      [west, east, south, north] = [Math.min(west, x), Math.max(east, x), Math.min(south, lat), Math.max(north, lat)];
    }
  const span = east - west;
  if (span >= 25 && Math.abs((south + north) / 2) >= 40) {
    const sixth = (north - south) / 6;
    return geoConicConformal().rotate([-lon0, 0]).parallels([south + sixth, north - sixth]);
  }
  return geoMercator().rotate([-lon0, 0]);
}

/** px per km of a projection around a point */
function pxPerKm(projection, [lon, lat]) {
  const [x0, y0] = projection([lon, lat]);
  const [x1, y1] = projection([lon, lat + 0.1]);
  return Math.hypot(x1 - x0, y1 - y0) / ((0.1 * Math.PI * EARTH_KM) / 180);
}

/** Projected rings: simplified, rounded, specks dropped; a ring the projection cannot show is skipped. */
function ringsOf(polygons, projection) {
  return polygons
    .flat()
    .map((ring) => ring.map((p) => projection(p)))
    .filter((ring) => ring.every(Boolean))
    .map((ring) => simplify(ring).map(([x, y]) => [round(x), round(y)]))
    .filter((ring) => ring.length >= 3);
}

const pathOfRings = (rings) => rings.map((ring) => `M${ring.map(([x, y]) => `${x},${y}`).join('L')}Z`).join('');

/** Cells of a CELL-px grid covered by rings (even-odd scanline fill, edges included). */
export function occupancy(rings) {
  const cells = new Set();
  const mark = (x, y) => cells.add(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`);
  for (const ring of rings) for (const [x, y] of ring) mark(x, y);
  for (const ring of rings) {
    const ys = ring.map(([, y]) => y);
    const [minY, maxY] = ys.reduce(([lo, hi], y) => [Math.min(lo, y), Math.max(hi, y)], [Infinity, -Infinity]);
    for (let row = Math.floor(minY / CELL); row <= Math.floor(maxY / CELL); row++) {
      const y = (row + 0.5) * CELL;
      const xs = [];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let col = Math.floor(xs[k] / CELL); col <= Math.floor(xs[k + 1] / CELL); col++) cells.add(`${col},${row}`);
    }
  }
  return cells;
}

/** Summed-area table of occupied cells, so a box is checked in constant time. */
function coverage(cells, cols, rows) {
  const sum = new Int32Array((cols + 1) * (rows + 1));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      sum[(r + 1) * (cols + 1) + c + 1] =
        (cells.has(`${c},${r}`) ? 1 : 0) + sum[r * (cols + 1) + c + 1] + sum[(r + 1) * (cols + 1) + c] - sum[r * (cols + 1) + c];
  /** occupied cells within the box [c0, c1) × [r0, r1), clamped to the grid */
  return (c0, r0, c1, r1) => {
    [c0, c1] = [Math.max(0, c0), Math.min(cols, c1)];
    [r0, r1] = [Math.max(0, r0), Math.min(rows, r1)];
    if (c0 >= c1 || r0 >= r1) return 0;
    const at = (r, c) => sum[r * (cols + 1) + c];
    return at(r1, c1) - at(r0, c1) - at(r1, c0) + at(r0, c0);
  };
}

const boxCells = ({ x, y, w, h }) => {
  const cells = new Set();
  for (let c = Math.floor(x / CELL); c <= Math.floor((x + w) / CELL); c++)
    for (let r = Math.floor(y / CELL); r <= Math.floor((y + h) / CELL); r++) cells.add(`${c},${r}`);
  return cells;
};

/**
 * Places boxes of the given sizes inside a WIDTH × height view without touching the occupied
 * cells or each other: against an edge of the view, as near as possible to each box's `target`
 * (where its islands really are). A box with no room grows the view at the top or the bottom.
 * Returns { boxes: [{x,y,w,h}], top, bottom }: the px added above and below the map.
 */
export function placeInsets(cells, height, sizes) {
  let top = 0;
  let bottom = 0;
  for (;;) {
    const taken = new Set(
      [...cells].map((key) => {
        const [col, row] = key.split(',').map(Number);
        return `${col},${row + top / CELL}`;
      }),
    );
    const total = height + top + bottom;
    const boxes = [];
    let stuck = null;
    for (const { w, h, target } of sizes) {
      const used = coverage(taken, Math.ceil(WIDTH / CELL), Math.ceil(total / CELL));
      const [tx, ty] = [target[0], target[1] + top];
      const gap = Math.ceil(INSET_GAP / CELL);
      let best = null;
      for (let x = PAD; x + w <= WIDTH - PAD; x += CELL)
        for (let y = PAD; y + h <= total - PAD; y += CELL) {
          const [c0, r0] = [Math.floor(x / CELL) - gap, Math.floor(y / CELL) - gap];
          const [c1, r1] = [Math.floor((x + w) / CELL) + 1 + gap, Math.floor((y + h) / CELL) + 1 + gap];
          if (used(c0, r0, c1, r1) > 0) continue;
          const edge = Math.min(x - PAD, WIDTH - PAD - x - w, y - PAD, total - PAD - y - h);
          const score = edge + 0.5 * Math.hypot(x + w / 2 - tx, y + h / 2 - ty);
          if (!best || score < best.score) best = { box: { x, y, w, h }, score };
        }
      if (!best) {
        stuck = { h, above: ty < (height + top) / 2 };
        break;
      }
      boxes.push(best.box);
      for (const key of boxCells(best.box)) taken.add(key);
    }
    if (!stuck) return { boxes, top, bottom };
    const grow = Math.ceil((stuck.h + INSET_GAP + PAD) / CELL) * CELL;
    if (stuck.above) top += grow;
    else bottom += grow;
  }
}

/** Admin-1 features (and capitals from populated places) → the regions map for one country. */
export function buildRegionMap(code, admin1, places = []) {
  const iso = code.toUpperCase();
  const features = admin1
    .filter((f) => f.properties.iso_a2 === iso || (ADM0_A3[iso] && f.properties.adm0_a3 === ADM0_A3[iso]))
    .map((f) => ({ ...f, geometry: rewind(f.geometry) }));
  if (features.length === 0) throw new Error(`${iso} has no admin-1 regions in Natural Earth`);
  const layout = iso === 'US' ? usLayout(features) : insetLayout(features, EXCLUDE[iso]);

  const capitals = places.filter(
    (p) => isoOf(p.properties) === iso && /capital/i.test(p.properties.featurecla ?? ''),
  );
  const states = uniqueStateNames(
    layout.regions
      .map(({ feature, pieces }) => {
        const props = feature.properties;
        // the label goes on the piece holding most of the region, the capital on its own piece
        const home = pieces.reduce((a, b) => (b.area > a.area ? b : a));
        const [lx, ly] = geoPath(home.projection).centroid(multi(home.polygons));
        const capital = capitals.find((c) => norm(c.properties.adm1name) === norm(props.name));
        const lonLat = capital && [capital.properties.longitude, capital.properties.latitude];
        const capitalPiece = lonLat && (pieces.find((p) => contains(multi(p.polygons), lonLat)) ?? home);
        const xy = capitalPiece && capitalPiece.projection(lonLat);
        return {
          code: regionCode(props),
          name: props.name_en || props.name,
          type: props.type_en,
          path: pathOfRings(pieces.flatMap((p) => ringsOf(p.polygons, p.projection))),
          label: [Math.round(lx), Math.round(ly)],
          ...(xy && { capital: { xy: xy.map(Math.round), lat: lonLat[1], lon: lonLat[0] } }),
        };
      })
      .filter((state) => state.path),
  ).sort((a, b) => a.code.localeCompare(b.code));
  return {
    country: iso,
    viewBox: `0 0 ${WIDTH} ${layout.height}`,
    source: `Simplified from Natural Earth ne_10m_admin_1_states_provinces; ${layout.projection} fitWidth ${WIDTH}${layout.insets.length ? ', far islands in insets' : ''}`,
    ...(layout.insets.length > 0 && { insets: layout.insets }),
    states,
  };
}

/** The US on d3's Albers USA, which already insets Alaska and Hawaii; frames are drawn round both. */
function usLayout(features) {
  const collection = { type: 'FeatureCollection', features };
  const projection = geoAlbersUsa().fitWidth(WIDTH - 2 * PAD, collection);
  const path = geoPath(projection);
  const framed = ['AK', 'HI']
    .map((code) => features.find((f) => regionCode(f.properties) === code))
    .filter(Boolean)
    .map((f) => {
      const [[x0, y0], [x1, y1]] = path.bounds(f);
      return [x0 - INSET_PAD, y0 - INSET_PAD, x1 + INSET_PAD, y1 + INSET_PAD];
    });
  const [[, y0], [, y1]] = path.bounds(collection);
  const top = Math.min(y0, ...framed.map((b) => b[1]));
  const bottom = Math.max(y1, ...framed.map((b) => b[3]));
  const [tx, ty] = projection.translate();
  projection.translate([tx + PAD, ty - top + PAD]);
  const dy = PAD - top;
  return {
    projection: 'albersUsa',
    height: Math.ceil(bottom - top + 2 * PAD),
    insets: framed.map(([x0, b0, x1, b1]) => ({
      x: Math.round(x0 + PAD),
      y: Math.round(b0 + dy),
      w: Math.round(x1 - x0),
      h: Math.round(b1 - b0),
    })),
    regions: features.map((feature) => ({
      feature,
      pieces: [{ projection, polygons: polygonsOf(feature.geometry), area: 1 }],
    })),
  };
}

/** The main cluster fitted to the width; every far group fitted into its own inset box. */
function insetLayout(features, exclude) {
  const parts = partsOf(features, exclude);
  const { main, insets } = clusterParts(parts);
  const mainGeometry = multi(main.map((i) => parts[i].polygon));
  const projection = mainProjection(mainGeometry).fitWidth(WIDTH - 2 * PAD, mainGeometry);
  const [[, y0], [, y1]] = geoPath(projection).bounds(mainGeometry);
  const [tx, ty] = projection.translate();
  projection.translate([tx + PAD, ty - y0 + PAD]);
  const mapHeight = Math.ceil(y1 - y0 + 2 * PAD);
  const scale = pxPerKm(projection, geoCentroid(mainGeometry));

  const [maxW, maxH] = [INSET_MAX_WIDTH, Math.min(INSET_MAX_WIDTH, Math.max(128, mapHeight / 5))];
  // each inset: a Mercator at the main map's scale, shrunk to fit the largest box or blown up to be seen
  const groups = insets.map((group) => {
    const geometry = multi(group.map((i) => parts[i].polygon));
    const centre = geoCentroid(geometry);
    const inset = geoMercator().rotate([-centre[0], 0]).translate([0, 0]);
    inset.scale(scale * EARTH_KM * Math.cos((centre[1] * Math.PI) / 180));
    const [[bx0, by0], [bx1, by1]] = geoPath(inset).bounds(geometry);
    const [bw, bh] = [bx1 - bx0 || 1, by1 - by0 || 1];
    const island = Math.max(
      ...group.map((i) => {
        const [[x0, y0], [x1, y1]] = geoPath(inset).bounds({ type: 'Polygon', coordinates: parts[i].polygon });
        return Math.max(x1 - x0, y1 - y0);
      }),
    );
    // blown up until the islands can be picked, but never bigger than the largest box
    const fit = Math.min(
      Math.max(1, INSET_MIN_CONTENT / Math.max(bw, bh), INSET_MIN_ISLAND / (island || 1)),
      (maxW - 2 * INSET_PAD) / bw,
      (maxH - 2 * INSET_PAD) / bh,
    );
    inset.scale(inset.scale() * fit);
    const [[cx0, cy0], [cx1, cy1]] = geoPath(inset).bounds(geometry);
    const w = Math.max(INSET_MIN, Math.ceil(cx1 - cx0 + 2 * INSET_PAD));
    const h = Math.max(INSET_MIN, Math.ceil(cy1 - cy0 + 2 * INSET_PAD));
    const t = projection(centre) ?? [WIDTH / 2, mapHeight / 2];
    const target = [Math.min(Math.max(t[0], 0), WIDTH), Math.min(Math.max(t[1], 0), mapHeight)];
    return { group, geometry, inset, bounds: [cx0, cy0, cx1, cy1], w, h, target };
  });

  const cells = occupancy(ringsOf(main.map((i) => parts[i].polygon), projection));
  const placed = placeInsets(cells, mapHeight, groups);
  projection.translate([projection.translate()[0], projection.translate()[1] + placed.top]);
  const projectionOf = new Map(main.map((i) => [i, projection]));
  groups.forEach(({ group, inset, bounds: [cx0, cy0, cx1, cy1] }, k) => {
    const { x, y, w, h } = placed.boxes[k];
    inset.translate([x + (w - (cx1 - cx0)) / 2 - cx0, y + (h - (cy1 - cy0)) / 2 - cy0]);
    for (const i of group) projectionOf.set(i, inset);
  });

  const regions = features
    .map((feature, index) => {
      const own = parts.filter((p, i) => p.index === index && projectionOf.has(i));
      const byProjection = Map.groupBy(own, (p) => projectionOf.get(parts.indexOf(p)));
      const pieces = [...byProjection].map(([proj, ps]) => ({
        projection: proj,
        polygons: ps.map((p) => p.polygon),
        area: ps.reduce((s, p) => s + p.area, 0),
      }));
      return { feature, pieces };
    })
    .filter((r) => r.pieces.length > 0);
  return {
    projection: projection.parallels ? 'conic conformal' : 'mercator',
    height: mapHeight + placed.top + placed.bottom,
    insets: placed.boxes,
    regions,
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
