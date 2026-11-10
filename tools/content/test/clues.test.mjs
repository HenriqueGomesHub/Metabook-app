// The clue catalogue: classification, titles, regions, lookalikes and the build from cached sources.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  buildClues,
  classify,
  clueTitle,
  countryLookup,
  lookalikesOf,
  noteToMarkdown,
  regionOf,
  similarity,
  splitMetaName,
  stripMarkdown,
  targetOf,
  writeClues,
} from '../clues.mjs';
import { parseMapData } from '../learnablemeta.mjs';
import { loadPool } from '../lib/common.mjs';

const fixtureDir = new URL('fixtures/plonkit/', import.meta.url);
const page = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, fixtureDir), 'utf8'));
const pages = ['poland', 'brazil', 'czechia', 'japan'].map(page);
const pool = loadPool();
const lmMap = (geoguessrId) => ({
  geoguessrId,
  fetchedAt: '2026-11-01T00:00:00.000Z',
  ...parseMapData(JSON.parse(readFileSync(new URL('fixtures/learnablemeta/map-data.json', import.meta.url), 'utf8'))),
});
const tips = (raw) => raw.data.public.steps.flatMap((s) => (s.items ?? []).filter((i) => i.kind === 'tip'));
const tip = (raw, id) => tips(raw).find((i) => i.id === id);

describe('classify', () => {
  it('takes the family from Plonk It tags first', () => {
    assert.deepEqual(classify({ tags: ['bollard'], text: ['Anything'] }), { family: 'bollard' });
    assert.deepEqual(classify({ tags: ['important', 'license plates'], text: ['x'] }), { family: 'plate' });
    assert.deepEqual(classify({ tags: ['roadline'], text: ['x'] }), { family: 'line' });
    assert.deepEqual(classify({ tags: ['coverage'], text: ['Gen 3 coverage only.'] }), { family: 'car' });
    assert.deepEqual(classify({ tags: ['coverage'], text: ['Most coverage is in the east.'] }), { family: 'coverage' });
    assert.deepEqual(classify({ tags: ['moving info'], text: ['Old **bollards** are rare.'] }), { family: 'bollard' });
  });

  it('gives tagged signs a kind, chevron when the text names none', () => {
    assert.deepEqual(classify({ tags: ['chevron/sign'], text: ['Stop signs say STOP.'] }), { family: 'sign', kind: 'stop' });
    assert.deepEqual(classify({ tags: ['chevron/sign'], text: ['Black with white arrows.'] }), { family: 'sign', kind: 'chevron' });
  });

  it('falls back to the earliest keyword of the first paragraph, then of the whole text, then other', () => {
    assert.deepEqual(classify({ text: ['Regional roads have 3-digit road numbers on direction signs.'] }), { family: 'sign', kind: 'route' });
    assert.deepEqual(classify({ text: ['Utility poles here carry bollard-like stripes.'] }), { family: 'pole' });
    assert.deepEqual(classify({ text: ['Nothing to see.', 'But the trees are tall.'] }), { family: 'vegetation' });
    assert.deepEqual(classify({ text: ['Phone numbers have 9 digits.'] }), { family: 'other' });
    assert.deepEqual(classify({ text: ['Iceland is a geologically active country on two tectonic plates.'] }), { family: 'other' });
  });

  it('classifies the fixture pages', () => {
    const pl = pages[0];
    assert.equal(classify({ tags: tip(pl, 'y2jz').tags, text: tip(pl, 'y2jz').data.text }).family, 'plate');
    assert.equal(classify({ tags: tip(pl, 'vySo').tags, text: tip(pl, 'vySo').data.text }).family, 'bollard');
    assert.deepEqual(classify({ tags: tip(pl, 'OH23').tags, text: tip(pl, 'OH23').data.text }), { family: 'sign', kind: 'route' });
    const families = (raw) => new Set(tips(raw).map((i) => classify({ tags: i.tags, text: i.data.text }).family));
    for (const raw of pages) {
      const found = families(raw);
      for (const family of ['pole', 'sign', 'architecture']) assert.ok(found.has(family), `${raw.data.public.slug} has ${family}`);
    }
    const others = pages.flatMap(tips).filter((i) => classify({ tags: i.tags, text: i.data.text }).family === 'other');
    assert.ok(others.length / pages.flatMap(tips).length < 0.2, `${others.length} clues are 'other'`);
  });
});

describe('titles, regions and lookalikes', () => {
  it('labels the first clause of the first sentence, markdown stripped', () => {
    assert.equal(stripMarkdown('A **red** [strip](https://x.y/z) `x`'), 'A red strip x');
    assert.equal(clueTitle('bollard', undefined, 'Polish bollards have a **red strip**, wrapped. More.'), 'Bollard: Polish bollards have a red strip');
    assert.equal(clueTitle('sign', 'stop', 'Stop signs are octagonal.'), 'Stop sign: Stop signs are octagonal');
    assert.equal(clueTitle('other', undefined, 'Phone numbers have nine digits in total.'), 'Phone numbers have nine digits in total');
    assert.equal(clueTitle('bollard', undefined, 'In Extremadura, bollards are tall.'), 'Bollard: In Extremadura, bollards are tall');
    const long = clueTitle('pole', undefined, 'Poles with a very long description that goes on and on and on past sixty characters');
    assert.ok(long.length <= 'Pole: '.length + 61 && long.endsWith('…'), long);
    assert.equal(clueTitle('car', undefined, ''), 'Google car');
  });

  it('scopes a clue to region names in the first sentence of a regional step only', () => {
    const names = ['Acre', 'Minas Gerais', 'Rio Grande do Sul', 'Sul', 'Espírito Santo'];
    assert.equal(regionOf('Regional and state-specific clues', 'Acre has **small grass hills**.', names), 'Acre');
    assert.equal(regionOf('Region-specific clues', 'Found in Rio Grande do Sul and Minas Gerais.', names), 'Rio Grande do Sul, Minas Gerais');
    assert.equal(regionOf('Regional clues', 'Espirito Santo has rocks.', names), 'Espírito Santo');
    assert.equal(regionOf('Identifying Brazil', 'Acre has hills.', names), undefined);
    assert.equal(regionOf('Regional clues', 'Rolling hills are common. Acre is flat.', names), undefined);
    assert.equal(regionOf('Regional clues', 'The acre is a unit.', names), undefined);
  });

  it('lists other pool countries the text names, not "New Mexico" or the Georgia in the US', () => {
    assert.deepEqual(lookalikesOf('Hungary and Romania also have holey poles, unlike Poland.', 'PL', pool), ['HU', 'RO']);
    assert.deepEqual(lookalikesOf('Found in New Mexico and Georgia, like in the UK.', 'US', pool), ['GB']);
    assert.deepEqual(lookalikesOf('Same as in Georgia and the Czech Republic.', 'TR', pool), ['CZ', 'GE']);
    assert.deepEqual(lookalikesOf('Also in Réunion, but not in North Korea; for us it is clear.', 'FR', pool), ['RE']);
  });

  it('maps a Learnable Meta name to a pool code by its prefix', () => {
    const lookup = countryLookup(pool);
    assert.deepEqual(splitMetaName('Russia - Eastern bollard'), { prefix: 'Russia', thing: 'Eastern bollard' });
    for (const [prefix, code] of [['Germany', 'DE'], ['USA', 'US'], ['UK', 'GB'], ['Czech Republic', 'CZ'], ['Türkiye', 'TR'], ['Turkey', 'TR'], ['Curacao', 'CW']]) {
      assert.equal(lookup.get(prefix.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()), code, prefix);
    }
  });

  it('turns HTML notes into markdown paragraphs and compares texts', () => {
    assert.deepEqual(noteToMarkdown('<p>A <strong>red</strong> strip &amp; <a href="x">link</a>.</p><p>Second<br>third</p>'), ['A **red** strip & link .', 'Second', 'third']);
    assert.ok(similarity('Polish bollards have a red strip', 'Polish bollards have a **red strip** all around') > 0.9);
    assert.equal(similarity('Bus stops are yellow', 'Polish bollards have a red strip'), 0);
  });

  it('sends sub-territory pages to their parent unless the pool has them', () => {
    const codes = new Set(['US', 'PT', 'PL']);
    assert.deepEqual(targetOf('PL', codes), { country: 'PL' });
    assert.deepEqual(targetOf('US-AK', codes), { country: 'US', sub: true });
    assert.equal(targetOf('UM-MQ', codes), undefined);
    assert.equal(targetOf('AQ', codes), undefined);
  });
});

describe('buildClues', () => {
  const links = { 'https://goo.gl/maps/JLqgxCCLwZPCWaBc6': { url: 'https://www.google.com/maps/@50.1,19.9,3a,75y,90h,80t/data=!3m6!1e1!3m4!1sabcdefghijklmnopqrstuv!2e0' } };
  const { countries, unmatched, counts } = buildClues({ pages, maps: [lmMap('b'), lmMap('a')], links }, { pool });
  const pl = countries.find((c) => c.country === 'PL');

  it('makes one clue per tip item, in step and item order, with credit', () => {
    assert.deepEqual(countries.map((c) => c.country), ['BR', 'CZ', 'DE', 'JP', 'PL']);
    assert.equal(pl.clues.filter((c) => c.credit.source === 'Plonk It').length, tips(pages[0]).length);
    const bollard = pl.clues.find((c) => c.id === 'pl-vySo');
    assert.equal(bollard.family, 'bollard');
    assert.equal(bollard.step, 0);
    assert.deepEqual(bollard.lookalikes, ['UA']);
    assert.deepEqual(bollard.credit, { source: 'Plonk It', url: 'https://www.plonkit.net/poland', licence: 'CC BY-NC-SA 4.0' });
    assert.ok(pl.clues.every((c, i, all) => i === 0 || all[i - 1].step < c.step || all[i - 1].order < c.order || c.credit.source !== 'Plonk It'));
    assert.ok(!pl.clues.some((c) => c.id === 'pl-07ts'), 'centeredImage items are skipped');
  });

  it('gives each image an absolute src, a hash id and its Street View spot', () => {
    const [image, merged] = pl.clues.find((c) => c.id === 'pl-vySo').images;
    assert.equal(image.src, 'https://www.plonkit.net/images/poland/Poland-bollard.png');
    assert.match(image.id, /^[0-9a-f]{12}$/);
    assert.equal(image.giveaway, undefined);
    assert.deepEqual(image.location, { pano: 'abcdefghijklmnopqrstuv', lat: 50.1, lng: 19.9, heading: 90, pitch: -10, fov: 75, source: 'plonkit' });
    assert.deepEqual(pl.clues.find((c) => c.id === 'pl-vySo').locations, [image.location]);
    assert.equal(merged.src, 'https://learnablemeta.com/images/pl-bollard.avif');
    assert.equal(pl.clues.find((c) => c.id === 'pl-dcsB').images[0].giveaway, true, 'a map gives the answer away');
  });

  it('scopes regional clues', () => {
    const regional = pl.clues.filter((c) => c.region);
    assert.ok(regional.length > 0 && regional.every((c) => pl.steps[c.step].title.startsWith('Regional')));
  });

  it('merges a matching meta into its Plonk It clue and adds the others as their own clues', () => {
    assert.equal(counts.metasMerged, 1);
    assert.equal(counts.metasAdded, 2);
    const bus = pl.clues.find((c) => c.id === 'pl-lm-102');
    assert.equal(pl.steps[bus.step].title, 'Learnable Meta');
    assert.deepEqual(bus.text, ['Bus stops are often **yellow**, like in Lithuania.', 'See the map of where they are.']);
    assert.deepEqual(bus.lookalikes, ['LT']);
    assert.equal(bus.images[0].giveaway, true);
    assert.deepEqual(bus.credit, {
      source: 'Learnable Meta',
      url: 'https://learnablemeta.com/maps/a',
      licence: 'Learnable Meta; notes partly from Plonk It (CC BY-NC-SA 4.0)',
    });
    const de = countries.find((c) => c.country === 'DE');
    assert.deepEqual(de.clues.map((c) => [c.id, c.family, c.title]), [['de-lm-103', 'bollard', 'Bollard: Bollard']]);
    assert.deepEqual(unmatched, { Atlantis: 1 });
  });

  it('is deterministic', () => {
    const again = buildClues({ pages: [...pages].reverse(), maps: [lmMap('a'), lmMap('b')], links }, { pool });
    assert.deepEqual(again.countries, countries);
  });

  it('limits the build to `only`', () => {
    assert.deepEqual(buildClues({ pages, maps: [], links: {} }, { pool, only: ['CZ'] }).countries.map((c) => c.country), ['CZ']);
  });

  it('attaches a sub-territory page to its parent as a region', () => {
    const alaska = structuredClone(pages[0]);
    Object.assign(alaska.data.public, { title: 'Alaska', slug: 'alaska', code: 'US-AK' });
    const us = buildClues({ pages: [alaska], maps: [], links: {} }, { pool }).countries[0];
    assert.equal(us.country, 'US');
    assert.ok(us.clues.every((c) => c.id.startsWith('us-ak-') && c.region === 'Alaska' && c.credit.url === 'https://www.plonkit.net/alaska'));
    assert.equal(us.steps[0].title, 'Alaska: Identifying Poland');
  });
});

describe('writeClues', () => {
  it('writes the country files and the index, keeping copied image paths', () => {
    const sources = mkdtempSync(join(tmpdir(), 'clue-sources-'));
    const out = mkdtempSync(join(tmpdir(), 'clues-'));
    mkdirSync(join(sources, 'plonkit'));
    writeFileSync(join(sources, 'plonkit', 'poland.json'), JSON.stringify(pages[0]));
    writeFileSync(join(out, 'xx.json'), '{}');
    const first = writeClues({ sourcesDir: sources, outDir: out, pool });
    assert.equal(first.counts.countries, 1);
    assert.deepEqual(readdirSync(out).sort(), ['index.json', 'pl.json']);

    const file = JSON.parse(readFileSync(join(out, 'pl.json'), 'utf8'));
    Object.assign(file.clues[0].images[0], { path: `pl/${file.clues[0].images[0].id}.webp`, width: 800, height: 600 });
    writeFileSync(join(out, 'pl.json'), JSON.stringify(file));
    writeClues({ sourcesDir: sources, outDir: out, pool });
    const again = JSON.parse(readFileSync(join(out, 'pl.json'), 'utf8'));
    assert.equal(again.clues[0].images[0].width, 800);

    const [row] = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
    assert.equal(row.country, 'PL');
    assert.equal(row.clues, again.clues.length);
    assert.equal(Object.values(row.families).reduce((a, b) => a + b, 0), row.clues);
  });
});
