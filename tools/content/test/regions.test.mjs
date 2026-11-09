import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  buildRegionMap,
  clusterParts,
  mainProjection,
  partsOf,
  placeInsets,
  rewind,
  simplify,
  uniqueStateNames,
  WIDTH,
} from '../regions.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8'));

describe('regions', () => {
  const map = buildRegionMap('pl', fixture('admin1-mini.json').features, fixture('places-mini.json').features);

  it('builds the br-states.json shape for one country, fitted to 640 wide', () => {
    assert.equal(map.country, 'PL');
    assert.match(map.viewBox, new RegExp(`^0 0 ${WIDTH} \\d+$`));
    assert.deepEqual(map.states.map((s) => [s.code, s.name]), [
      ['LD', 'Łódź Voivodeship'],
      ['MZ', 'Masovian Voivodeship'],
    ]);
    const height = Number(map.viewBox.split(' ')[3]);
    for (const s of map.states) {
      assert.match(s.path, /^M[\d.,L]+Z$/);
      const nums = s.path.match(/[\d.]+/g).map(Number);
      assert.ok(nums.every((n) => n >= 0 && n <= Math.max(WIDTH, height)));
      assert.equal(s.label.length, 2);
    }
  });

  it('adds capitals where Natural Earth names one', () => {
    const mz = map.states.find((s) => s.code === 'MZ');
    assert.deepEqual([mz.capital.lat, mz.capital.lon], [52.25, 21]);
    assert.equal(mz.capital.xy.length, 2);
    assert.equal(map.states.find((s) => s.code === 'LD').capital, undefined);
  });

  it('fails clearly for a country without regions', () => {
    assert.throws(() => buildRegionMap('jp', fixture('admin1-mini.json').features), /no admin-1/);
  });

  it('simplifies collinear points away', () => {
    assert.deepEqual(simplify([[0, 0], [1, 0.1], [2, 0], [3, 0]]), [[0, 0], [3, 0]]);
  });

  it('winds exterior rings clockwise for d3', () => {
    const ccw = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
    assert.deepEqual(rewind(ccw).coordinates[0][1], [0, 1]);
    assert.deepEqual(rewind(rewind(ccw)), rewind(ccw));
  });

  it('gives every state a unique, non-empty name', () => {
    const state = (code, name, type, path = `M${code}Z`) => ({ code, name, type, path, label: [0, 0] });
    const states = uniqueStateNames([
      state('B', 'Buenos Aires', 'Province'),
      state('C', 'Buenos Aires', 'City'),
      state('22', 'Sofia', 'Province'),
      state('23', 'Sofia', 'Province'),
      state('VMR', 'Valmiera', 'Republican City'),
      state('008', 'Valmiera', 'Municipality'),
      state('009', 'Valmiera', 'Municipality'),
      // one state in two shapes: merged, not renamed
      state('A', 'Toamasina', 'Autonomous Province', 'M1Z'),
      state('A', 'Toamasina', 'Autonomous Province', 'M2Z'),
      state('RUS+99?', null, undefined),
      state('X', '  ', undefined),
    ]);
    assert.deepEqual(states.map((s) => [s.code, s.name]), [
      ['B', 'Buenos Aires (Province)'],
      ['C', 'Buenos Aires (City)'],
      ['22', 'Sofia (22)'],
      ['23', 'Sofia (23)'],
      ['VMR', 'Valmiera (Republican City)'],
      ['008', 'Valmiera (008)'],
      ['009', 'Valmiera (009)'],
      ['A', 'Toamasina'],
      ['RUS+99?', 'RUS+99?'],
      ['X', 'X'],
    ]);
    assert.equal(states.find((s) => s.code === 'A').path, 'M1ZM2Z');
    assert.ok(states.every((s) => !('type' in s)));
  });

  describe('exclusions and insets', () => {
    const box = (w, s, e, n) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
    const feature = (iso, code, name, ...polygons) => ({
      type: 'Feature',
      properties: { iso_a2: iso, iso_3166_2: `${iso}-${code}`, name, name_en: name },
      geometry: rewind({ type: 'MultiPolygon', coordinates: polygons }),
    });
    // a mainland of two regions, a near island, far islands and a speck of the mainland far out
    const country = (iso) => [
      feature(iso, 'N', 'North', box(-9, 40, -6, 42), box(-6.8, 39.2, -6.6, 39.4)),
      feature(iso, 'S', 'South', box(-9, 37, -6, 40)),
      feature(iso, 'I', 'Islands', box(-26, 37.5, -25, 38), box(-28.5, 38.5, -27.5, 39)),
      feature(iso, 'R', 'Rock', box(-17, 32.6, -16.7, 32.8)),
    ];
    const parts = partsOf(country('PT'));

    it('drops excluded regions and the polygons inside excluded areas', () => {
      const kept = partsOf(country('PT'), { regions: ['R'], areas: [[-29, 38.4, -27, 39.1]] });
      assert.equal(kept.length, 4);
      assert.ok(kept.every((p) => p.polygon[0][0][0] > -27));
      const regions = buildRegionMap('fr', [...country('FR'), feature('FR', 'RE', 'Réunion', box(55.2, -21.4, 55.8, -20.9))]).states;
      assert.deepEqual(regions.map((s) => s.code), ['I', 'N', 'R', 'S']);
    });

    it('keeps near islands with the mainland and groups far ones by neighbourhood', () => {
      const { main, insets, dropped } = clusterParts(parts);
      const codes = (indexes) => indexes.map((i) => country('PT')[parts[i].index].properties.name);
      assert.deepEqual(codes(main), ['North', 'North', 'South']);
      // the two Islands polygons are 200 km apart: one region, one inset; the Rock its own
      assert.deepEqual(insets.map(codes), [['Islands', 'Islands'], ['Rock']]);
      assert.deepEqual(dropped, []);
    });

    it('draws a far group as big as the mainland in place, and drops far specks of mainland regions', () => {
      const big = partsOf([...country('PT'), feature('PT', 'B', 'Big', box(-40, 37, -37, 42))]);
      const { main, insets } = clusterParts(big);
      assert.ok(main.some((i) => big[i].index === 4));
      assert.ok(insets.every((g) => g.every((i) => big[i].index !== 4)));
      const speck = partsOf([feature('PT', 'N', 'North', box(-9, 37, -6, 42), box(-20, 30, -19.99, 30.01))]);
      assert.equal(clusterParts(speck).dropped.length, 1);
    });

    it('fits the mainland to the width and draws each far group in a framed inset', () => {
      const map = buildRegionMap('pt', country('PT'));
      const [, , width, height] = map.viewBox.split(' ').map(Number);
      assert.equal(width, WIDTH);
      assert.equal(map.insets.length, 2);
      const inside = ([x, y], b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
      const points = (s) => s.path.match(/[\d.]+,[\d.]+/g).map((p) => p.split(',').map(Number));
      for (const b of map.insets) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= width && b.y + b.h <= height);
      const [islands, rock] = map.insets;
      const state = (code) => map.states.find((s) => s.code === code);
      assert.ok(points(state('I')).every((p) => inside(p, islands)));
      assert.ok(inside(state('I').label, islands));
      assert.ok(points(state('R')).every((p) => inside(p, rock)));
      // the mainland is drawn at full width and never under a frame
      const mainland = [...points(state('N')), ...points(state('S'))];
      assert.ok(Math.max(...mainland.map(([x]) => x)) - Math.min(...mainland.map(([x]) => x)) > WIDTH - 20);
      assert.ok(mainland.every((p) => map.insets.every((b) => !inside(p, b))));
    });

    it('places boxes clear of the map and of each other, growing the view when full', () => {
      const cells = new Set();
      for (let c = 0; c < WIDTH / 4; c++) for (let r = 0; r < 25; r++) if (c < 100) cells.add(`${c},${r}`);
      const { boxes, top, bottom } = placeInsets(cells, 100, [
        { w: 150, h: 60, target: [WIDTH, 50] },
        { w: 150, h: 60, target: [WIDTH, 50] },
      ]);
      assert.equal(boxes.length, 2);
      const [a, b] = boxes;
      assert.ok(a.x >= 400 && b.x >= 400, 'beside the map, on the free right side');
      assert.ok(a.y + a.h <= b.y || b.y + b.h <= a.y || a.x + a.w <= b.x || b.x + b.w <= a.x, 'no overlap');
      assert.ok(top + bottom > 0, 'two 60 px tall boxes do not fit beside the map in 100 px');
    });

    it('uses Albers USA for the US, framing Alaska and Hawaii', () => {
      const us = (code, ...polygons) => ({ ...feature('US', code, code, ...polygons), properties: { iso_a2: 'US', iso_3166_2: `US-${code}`, name: code, postal: code } });
      const map = buildRegionMap('us', [
        us('CO', box(-109, 37, -102, 41)),
        us('AK', box(-160, 60, -145, 68)),
        us('HI', box(-157, 19, -155, 21)),
      ]);
      assert.match(map.source, /albersUsa/);
      assert.equal(map.insets.length, 2);
      assert.ok(map.states.every((s) => /^M[\d.,LMZ]+$/.test(s.path)));
    });

    it('projects wide high-latitude countries on a cone, the rest on Mercator', () => {
      const geometry = (w, s, e, n) => rewind({ type: 'MultiPolygon', coordinates: [box(w, s, e, n)] });
      assert.ok(mainProjection(geometry(30, 45, 170, 75)).parallels);
      assert.equal(mainProjection(geometry(-9, 37, -6, 42)).parallels, undefined);
    });
  });
});

