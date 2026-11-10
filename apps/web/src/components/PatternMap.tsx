import { patternGroups, patternKey } from '@metabook/core';
import type { AreaCodePattern, PlacedCode } from '@metabook/core';
import type { RegionMap } from '../data/content';
import './pattern-map.css';

/**
 * Group colours, in group order: Okabe–Ito based, readable on the dark surface and on white,
 * and never the only cue (the digits are printed on the map and listed in the legend).
 */
export const GROUP_COLOURS = [
  '#e69f00',
  '#56b4e9',
  '#2fb38a',
  '#f0e442',
  '#5b8fe0',
  '#e06a2b',
  '#d687b8',
  '#a98ddc',
  '#c9a56b',
];

type Codes = (PlacedCode & { spans?: string[] })[];

export interface LegendRow {
  key: string;
  /** how the group's codes are written, e.g. "4x", "06x", "601" */
  form: string;
  label: string;
  colour: string;
}

/** The legend of a pattern country: one row per group, in the pattern's order. */
export function patternLegend(
  country: string,
  pattern: AreaCodePattern,
  codes: Codes,
): LegendRow[] {
  const computed = patternGroups(country, codes, pattern.digits);
  return pattern.groups.map((group, i) => ({
    key: group.key,
    form: computed.find((g) => g.key === group.key)?.form ?? `${group.key}x`,
    label: group.label,
    colour: GROUP_COLOURS[i % GROUP_COLOURS.length] ?? '#999',
  }));
}

/**
 * Each region's group keys, most codes first. A region with codes of its own takes their groups;
 * one reached only by codes spanning from a neighbour takes those codes' groups.
 */
export function regionGroupKeys(
  country: string,
  codes: Codes,
  digits: number,
): Map<string, string[]> {
  const own = new Map<string, Map<string, number>>();
  const spanned = new Map<string, Set<string>>();
  for (const entry of codes) {
    const key = patternKey(country, entry.code, digits);
    const counts = own.get(entry.region) ?? new Map<string, number>();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    own.set(entry.region, counts);
    for (const span of entry.spans ?? [])
      spanned.set(span, (spanned.get(span) ?? new Set()).add(key));
  }
  const result = new Map<string, string[]>();
  for (const [region, counts] of own)
    result.set(
      region,
      [...counts].sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b)).map(([key]) => key),
    );
  for (const [region, keys] of spanned)
    if (!result.has(region)) result.set(region, [...keys].sort());
  return result;
}

type Point = [number, number];

/** Points grouped by single-link distance: a group split across the country gets one digit per part. */
function clusters(points: Point[], gap: number): Point[][] {
  const out: Point[][] = [];
  for (const p of points) {
    const near = out.filter((c) => c.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= gap));
    const merged = [p, ...near.flat()];
    for (const c of near) out.splice(out.indexOf(c), 1);
    out.push(merged);
  }
  return out;
}

/**
 * Where a cluster's digit goes: the region label nearest its centre, so it sits on land, or the
 * next nearest where that would overlap a digit already placed.
 */
function anchor(cluster: Point[], placed: Point[], room: number): Point {
  const cx = cluster.reduce((s, p) => s + p[0], 0) / cluster.length;
  const cy = cluster.reduce((s, p) => s + p[1], 0) / cluster.length;
  const byCentre = [...cluster].sort(
    (a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy),
  );
  const free = (p: Point) => placed.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) >= room);
  return byCentre.find(free) ?? (byCentre[0] as Point);
}

/** A few codes to show on a country without a pattern: one each for the regions with most codes. */
export function exampleCodes(codes: Codes, count = 6): { region: string; code: string }[] {
  const byRegion = new Map<string, string[]>();
  for (const c of codes) byRegion.set(c.region, [...(byRegion.get(c.region) ?? []), c.code]);
  return [...byRegion]
    .sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
    .slice(0, count)
    .map(([region, list]) => ({ region, code: [...list].sort()[0] ?? '' }));
}

/**
 * A country's regions map as a picture of its area-code pattern: each region coloured by the
 * group of its codes (striped where it uses two), with the group's digits printed on the map.
 * Without a pattern the regions are tinted in turn and a few example codes are printed instead.
 */
export function PatternMap({
  country,
  map,
  codes,
  pattern,
  label,
}: {
  country: string;
  map: RegionMap;
  codes: Codes;
  pattern?: AreaCodePattern;
  label: string;
}) {
  const [, , width = 640, height = 580] = map.viewBox.split(' ').map(Number);
  const font = Math.max(width, height) / 26;
  const grouped = pattern?.kind === 'pattern';
  const legend = grouped ? patternLegend(country, pattern, codes) : [];
  const colour = new Map(legend.map((row) => [row.key, row.colour]));
  const keys = grouped
    ? regionGroupKeys(country, codes, pattern.digits)
    : new Map<string, string[]>();
  const stripes = new Map<string, [string, string]>();
  const id = (a: string, b: string) => `stripe-${country}-${a}-${b}`;

  const regionCodes = [...new Set(map.states.map((s) => s.code))];
  const fillOf = (code: string): { fill?: string; group?: string } => {
    if (!grouped) {
      const i = regionCodes.indexOf(code);
      return { fill: GROUP_COLOURS[i % GROUP_COLOURS.length] ?? '#999' };
    }
    const [a, b] = (keys.get(code) ?? []).filter((k) => colour.has(k));
    if (!a) return {};
    if (!b) return { fill: colour.get(a) ?? '#999', group: a };
    stripes.set(id(a, b), [colour.get(a) ?? '#999', colour.get(b) ?? '#999']);
    return { fill: `url(#${id(a, b)})`, group: `${a} ${b}` };
  };
  const fills = new Map(regionCodes.map((code) => [code, fillOf(code)]));

  // digits at each part of each group
  const labelOf = new Map<string, Point>();
  for (const s of map.states)
    if (!labelOf.has(s.code) && s.label.length >= 2)
      labelOf.set(s.code, [s.label[0] ?? 0, s.label[1] ?? 0]);
  const marks: { text: string; at: Point; key: string }[] = [];
  if (grouped) {
    for (const row of legend) {
      let regions = [...keys].filter(([, k]) => k[0] === row.key).map(([r]) => r);
      if (regions.length === 0)
        regions = [...keys].filter(([, k]) => k.includes(row.key)).map(([r]) => r);
      const points = regions.flatMap((r) => (labelOf.has(r) ? [labelOf.get(r) as Point] : []));
      const text = row.form.split(' · ')[0]?.replace(/x$/, '') ?? row.key;
      for (const part of clusters(points, Math.hypot(width, height) * 0.16))
        marks.push({
          text,
          at: anchor(
            part,
            marks.map((m) => m.at),
            font * 1.3,
          ),
          key: row.key,
        });
    }
  } else {
    for (const { region, code } of exampleCodes(codes)) {
      const at = labelOf.get(region);
      if (at) marks.push({ text: code, at, key: region });
    }
  }

  return (
    <svg className="pattern-map" role="img" aria-label={label} viewBox={map.viewBox}>
      <defs>
        {[...stripes].map(([pid, [a, b]]) => (
          <pattern
            key={pid}
            id={pid}
            patternUnits="userSpaceOnUse"
            width="8"
            height="8"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" fill={a} />
            <rect width="4" height="8" fill={b} />
          </pattern>
        ))}
      </defs>
      {map.insets?.map((inset) => (
        <rect
          key={`${inset.x},${inset.y}`}
          className="pm-inset"
          x={inset.x}
          y={inset.y}
          width={inset.w}
          height={inset.h}
        />
      ))}
      {map.states.map((region, i) => {
        const { fill, group } = fills.get(region.code) ?? {};
        return (
          <path
            key={`${region.code}-${i}`}
            className={['pm-region', !grouped && 'soft', !fill && 'empty']
              .filter(Boolean)
              .join(' ')}
            d={region.path}
            fill={fill}
            data-region={region.code}
            data-group={group}
          />
        );
      })}
      {marks.map((mark, i) => (
        <text
          key={`${mark.key}-${i}`}
          className={grouped ? 'pm-digit' : 'pm-digit example'}
          x={mark.at[0]}
          y={mark.at[1]}
          dy="0.35em"
          style={{ fontSize: grouped ? font : font * 0.7 }}
        >
          {mark.text}
        </text>
      ))}
    </svg>
  );
}
