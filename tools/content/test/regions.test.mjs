import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildRegionMap, rewind, simplify, uniqueStateNames, WIDTH } from '../regions.mjs';

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
});
