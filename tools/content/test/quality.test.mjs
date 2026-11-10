// Image duplicates (perceptual hashes), the image sheets, reviews applied by the clues step, and the
// rule that a Learnable Meta meta only merges into its own country's Plonk It clue.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { buildClues, writeClues } from '../clues.mjs';
import { hashImage, runImageDupes } from '../imagedupes.mjs';
import { paginate, runImageSheets, sheetRows } from '../imagesheets.mjs';
import { loadPool, mediaId } from '../lib/common.mjs';
import { aHash, dHash, hamming, markDupes } from '../lib/phash.mjs';

const pool = loadPool();
const temp = (name) => mkdtempSync(join(tmpdir(), `${name}-`));

/** A synthetic photo: `seed` picks the pattern of soft blobs, so different seeds look different. */
async function photo(seed, width = 640, height = 480) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const v = y / height;
      const value = 128 + 60 * Math.sin((u * (seed + 2) + v * seed) * 6) + 60 * Math.cos(v * (seed % 5 + 1) * 5 - u * 3);
      const i = (y * width + x) * 3;
      data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, value));
      data[i] = Math.min(255, data[i] + seed * 9);
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

const plonkitSrc = (slug, file) => `https://www.plonkit.net/images/${slug}/${file}`;
const lmSrc = (file) => `https://learnablemeta.com/images/1/${file}.avif`;
const image = (src, width = 800) => ({ id: mediaId(src), src, width, height: 600 });
const clue = (id, source, images) => ({ id, family: 'bollard', title: id, credit: { source, url: 'https://example.com' }, images, locations: [] });

describe('perceptual hashes', () => {
  it('computes dHash and aHash bits and their distance', () => {
    const rising = Array.from({ length: 72 }, (_, i) => i % 9);
    assert.equal(dHash(rising), '0000000000000000');
    assert.equal(dHash(rising.map((p) => -p)), 'ffffffffffffffff');
    assert.equal(aHash(Array.from({ length: 64 }, (_, i) => (i < 32 ? 0 : 255))), '00000000ffffffff');
    assert.equal(hamming('0000000000000000', 'ffffffffffffffff'), 64);
    assert.equal(hamming('0f00000000000001', '0000000000000000'), 5);
  });

  it('gives a resized, re-encoded copy a near hash and another picture a far one', async () => {
    const original = await photo(3);
    const copy = await sharp(original).resize(300).jpeg({ quality: 50 }).toBuffer();
    const other = await photo(11);
    const [h, c, o] = await Promise.all([original, copy, other].map(hashImage));
    assert.ok(hamming(h.d, c.d) <= 6 && hamming(h.a, c.a) <= 6, `copy is near: ${hamming(h.d, c.d)}`);
    assert.ok(hamming(h.d, o.d) > 6, `other is far: ${hamming(h.d, o.d)}`);
  });

  it('marks copies within a country, keeping the Plonk It file, and copies across countries', async () => {
    const original = await photo(3);
    const big = await sharp(original).resize(1200).webp({ quality: 60 }).toBuffer();
    const pl = image(plonkitSrc('luxembourg', 'Bollards.png'), 600);
    const lm = image(lmSrc('copy'), 1200);
    const other = image(lmSrc('other'));
    const german = image(plonkitSrc('germany', 'Germany_Bollard.png'));
    const germanCopy = image(lmSrc('german-copy'));
    const hashes = {
      [pl.id]: await hashImage(original),
      [lm.id]: await hashImage(big),
      [other.id]: await hashImage(await photo(11)),
      [german.id]: await hashImage(await photo(7)),
      [germanCopy.id]: await hashImage(await sharp(await photo(7)).resize(500).toBuffer()),
    };
    const lu = {
      country: 'LU',
      clues: [
        clue('lu-lm-1', 'Learnable Meta', [{ ...lm }, { ...other }]),
        clue('lu-90cv', 'Plonk It', [{ ...pl }, { ...lm }, { ...germanCopy }]),
      ],
    };
    const de = { country: 'DE', clues: [clue('de-1', 'Plonk It', [{ ...german }])] };
    const report = markDupes([de, lu], hashes, new Map([['luxembourg', 'LU'], ['germany', 'DE']]));
    const [lmClue, plClue] = lu.clues;
    assert.equal(plClue.images[0].dupeOf, undefined, 'the Plonk It file is kept although smaller');
    assert.equal(plClue.images[1].dupeOf, pl.id, 'its Learnable Meta copy points at it');
    assert.equal(lmClue.images[0].dupeOf, pl.id, 'so does the same copy in another clue');
    assert.equal(lmClue.images[1].dupeOf, undefined, 'another picture is no duplicate');
    assert.equal(plClue.images[2].dupeOf, german.id, "a copy of Germany's Plonk It image is Germany's");
    assert.equal(de.clues[0].images[0].dupeOf, undefined);
    assert.deepEqual(report.crossCountry.map((p) => [p.imageId, p.country, p.of.imageId, p.of.country, p.resolved]), [[germanCopy.id, 'LU', german.id, 'DE', true]]);
    assert.equal(report.within + report.sameFile, 2);

    // re-running gives the same marks (old ones are cleared first)
    markDupes([de, lu], hashes, new Map([['luxembourg', 'LU'], ['germany', 'DE']]));
    assert.equal(plClue.images[1].dupeOf, pl.id);
  });

  it('marks a file repeated in two clues without hashes, and leaves unhashed images alone', () => {
    const a = image(plonkitSrc('poland', 'a.png'));
    const b = image(lmSrc('b'));
    const country = { country: 'PL', clues: [clue('pl-1', 'Plonk It', [{ ...a }, { ...b }]), clue('pl-lm-2', 'Learnable Meta', [{ ...a }])] };
    const report = markDupes([country], {});
    assert.equal(country.clues[1].images[0].dupeOf, a.id);
    assert.equal(country.clues[0].images[0].dupeOf, undefined);
    assert.equal(country.clues[0].images[1].dupeOf, undefined);
    assert.equal(report.unhashed, 2);
  });

  it('hashes only images not cached yet, from the bucket path', async () => {
    const dir = temp('clue-files');
    const hashesFile = join(temp('hashes'), 'imagehashes.json');
    const a = { ...image(plonkitSrc('poland', 'a.png')), path: 'pl/a.webp' };
    const b = { ...image(lmSrc('b')), path: 'pl/b.webp' };
    const c = image(lmSrc('c')); // not copied
    writeFileSync(join(dir, 'pl.json'), JSON.stringify({ country: 'PL', clues: [clue('pl-1', 'Plonk It', [a, b, c])] }));
    writeFileSync(hashesFile, JSON.stringify({ [a.id]: { d: '0000000000000000', a: '0000000000000000' } }));
    const asked = [];
    const storage = { download: async (path) => (asked.push(path), photo(5, 64, 48)) };
    const result = await runImageDupes({ storage, dir, hashesFile });
    assert.deepEqual(asked, ['pl/b.webp']);
    assert.deepEqual(result.counts, { cached: 1, hashed: 1, failed: 0, noPath: 1, left: 0 });
    assert.match(JSON.parse(readFileSync(hashesFile, 'utf8'))[b.id].d, /^[0-9a-f]{16}$/);

    const stopped = await runImageDupes({ storage, dir, hashesFile: join(temp('hashes'), 'h.json'), deadline: 0 });
    assert.equal(stopped.budgetHit, true);
    assert.equal(stopped.counts.left, 2);
  });
});

describe('image sheets', () => {
  const countries = [
    { country: 'PL', clues: [{ ...clue('pl-1', 'Plonk It', []), family: 'pole', images: Array.from({ length: 10 }, (_, i) => ({ ...image(lmSrc(`p${i}`)), path: `pl/p${i}.webp` })) }] },
    {
      country: 'DE',
      clues: [
        clue('de-1', 'Plonk It', [
          { ...image(lmSrc('d1')), path: 'de/d1.webp' },
          { ...image(lmSrc('d2')), path: 'de/d2.webp', dupeOf: 'x' },
          image(lmSrc('d3')),
        ]),
        { ...clue('de-2', 'Plonk It', [{ ...image(lmSrc('v')), path: 'de/v.webp' }]), family: 'vegetation' },
      ],
    },
  ];

  it('lists copied non-duplicates of the sheet families by family then country, a family per sheet', () => {
    const rows = sheetRows(countries);
    assert.deepEqual(rows.map((r) => r.clueId), ['de-1', ...Array(10).fill('pl-1')]);
    const sheets = paginate(rows);
    assert.deepEqual(sheets.map((s) => [s.n, s.rows.length, s.rows[0].family]), [[1, 1, 'bollard'], [2, 9, 'pole'], [3, 1, 'pole']]);
    assert.deepEqual(sheets[1].rows.map((r) => r.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('draws 3 x 3 sheets of numbered tiles and exports each image', async () => {
    const dir = temp('clue-files');
    const out = temp('sheets');
    for (const c of countries) writeFileSync(join(dir, `${c.country.toLowerCase()}.json`), JSON.stringify(c));
    const storage = { download: async (path) => photo(path.length, path.includes('p1') ? 1000 : 640, 480) };
    const result = await runImageSheets({ storage, dir, outDir: out });
    assert.deepEqual(result.counts, { sheets: 3, images: 11, failed: 0 });
    const meta = await sharp(join(out, 'sheets', '2.webp')).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 1224, 924]);
    const listed = JSON.parse(readFileSync(join(out, 'sheets', '2.json'), 'utf8'));
    assert.deepEqual(Object.keys(listed[0]), ['n', 'imageId', 'clueId', 'country', 'family', 'title', 'width', 'height']);
    const single = await sharp(join(out, 'img', `${listed[1].imageId}.webp`)).metadata();
    assert.equal(single.width, 768, 'a wide image is shrunk to 768');
    assert.ok(existsSync(join(out, 'manifest.json')));
  });
});

// --- the clues step ---------------------------------------------------------------------------------

const tipItem = (id, text, imageFile, tags = ['bollard'], slug = 'luxembourg') => ({
  kind: 'tip',
  id,
  tags,
  data: { text, image: { imageUrl: `/images/${slug}/${imageFile}` } },
});
const plonkitPage = (code, slug, title, items) => ({ fetchedAt: '2026-11-01T00:00:00.000Z', data: { public: { code, slug, title, steps: [{ title: `Identifying ${title}`, items }] } } });
const bollardText = 'Bollards are black and white, wedge-shaped, with grey reflectors and three bolts.';
const meta = (id, name, footerSlug, images, note = `<p>${bollardText}</p>`) => ({
  id,
  name,
  note,
  images,
  locationsCount: 1,
  footer: `Description and images taken from: <a href="https://www.plonkit.net/${footerSlug}">www.plonkit.net/${footerSlug}</a>.`,
});
const lmMap = (metas) => ({ geoguessrId: 'm1', fetchedAt: '2026-11-01T00:00:00.000Z', metas });

describe('Learnable Meta merge', () => {
  const pages = [
    plonkitPage('LU', 'luxembourg', 'Luxembourg', [tipItem('90cv', [bollardText], 'Bollards.png')]),
    plonkitPage('DE', 'germany', 'Germany', [tipItem('g1', ['Bollards are black and white with two bolts on the reflector.'], 'Bollard.png', ['bollard'], 'germany')]),
    plonkitPage('US', 'united-states', 'United States', [tipItem('u1', [bollardText], 'Bollard.png', ['bollard'], 'united-states')]),
  ];
  const byId = (countries, code, id) => countries.find((c) => c.country === code).clues.find((c) => c.id === id);

  it("merges a meta only into its own country's clue, and only when its footer links that country's page", () => {
    const { countries, counts } = buildClues(
      {
        pages,
        maps: [
          lmMap([
            meta(1, 'Luxembourg - Bollards', 'luxembourg', [lmSrc('lu-own')]),
            // a German meta whose text matches Luxembourg's tip and whose footer links Luxembourg
            meta(2, 'Germany - Bollards', 'luxembourg', [lmSrc('de-cross')]),
            // a Luxembourg meta that cites the German page
            meta(3, 'Luxembourg - Bollard comparison', 'germany', [lmSrc('lu-cites-de')]),
            meta(4, 'United States of America - Bollards', 'united-states-of-america', [lmSrc('us-old-slug')]),
          ]),
        ],
        links: {},
      },
      { pool },
    );
    const lu = byId(countries, 'LU', 'lu-90cv');
    assert.deepEqual(lu.images.map((i) => i.src), ['https://www.plonkit.net/images/luxembourg/Bollards.png', lmSrc('lu-own')]);
    assert.deepEqual(byId(countries, 'DE', 'de-g1').images.length, 1, 'nothing merged into Germany from a meta linking Luxembourg');
    assert.deepEqual(byId(countries, 'DE', 'de-lm-2').images.map((i) => i.src), [lmSrc('de-cross')], 'the German meta is a German clue of its own');
    assert.deepEqual(byId(countries, 'LU', 'lu-lm-3').images.map((i) => i.src), [lmSrc('lu-cites-de')]);
    assert.equal(byId(countries, 'US', 'us-u1').images.length, 2, "the old slug still counts as the US page");
    assert.deepEqual(counts, { metasMerged: 2, metasAdded: 2, geohintsAdded: 0 });
  });
});

describe('reviews in the clues step', () => {
  const setup = () => {
    const sources = temp('clue-sources');
    mkdirSync(join(sources, 'plonkit'));
    mkdirSync(join(sources, 'learnablemeta'));
    const page = plonkitPage('LU', 'luxembourg', 'Luxembourg', [
      tipItem('90cv', [bollardText], 'Bollards.png'),
      tipItem('kWxo', ['Almost all signs have white signposts.'], 'signpost.png', ['chevron/sign']),
      tipItem('SRxb', ['Houses tend to have dark slate roofs.'], 'Architecture.png', ['architecture']),
    ]);
    writeFileSync(join(sources, 'plonkit', 'luxembourg.json'), JSON.stringify(page));
    writeFileSync(
      join(sources, 'learnablemeta', 'm1.json'),
      JSON.stringify(lmMap([meta(1, 'Luxembourg - Bollards', 'luxembourg', [lmSrc('copy'), lmSrc('german-comparison')])])),
    );
    return { sources, out: temp('clues'), images: temp('review-images'), text: temp('review-text') };
  };
  const ids = {
    bollard: mediaId('https://www.plonkit.net/images/luxembourg/Bollards.png'),
    copy: mediaId(lmSrc('copy')),
    german: mediaId(lmSrc('german-comparison')),
    signpost: mediaId('https://www.plonkit.net/images/luxembourg/signpost.png'),
  };

  it('applies image and text reviews, drops rejected and mismatched images and hidden clues, and reports', () => {
    const { sources, out, images, text } = setup();
    writeFileSync(
      join(images, 'a.json'),
      JSON.stringify([
        { imageId: ids.bollard, role: 'annotated', caption: 'Front (F) and back (B) of a bollard', giveaway: true, crop: { x: 0, y: 0, w: 0.7, h: 1 } },
        { imageId: ids.german, role: 'comparison', country: 'DE' },
        { imageId: ids.signpost, reject: true },
        { imageId: 'ffffffffffff', role: 'example' },
        { imageId: ids.copy, role: 'nonsense' },
      ]),
    );
    writeFileSync(
      join(text, 'lu.json'),
      JSON.stringify({
        'lu-90cv': { title: 'Bollard: three bolts', summary: 'Black and white bollards; count the bolts.', sameAs: ['de'], differs: [{ country: 'BE', how: 'Belgian ones are white' }] },
        'lu-SRxb': { hide: true },
        'lu-nope': { summary: 'x' },
        'lu-kWxo': { sameAs: ['LU'] },
      }),
    );
    writeFileSync(join(text, 'zz.json'), '{}');
    const result = writeClues({ sourcesDir: sources, outDir: out, pool, reviewImagesDir: images, reviewTextDir: text });
    const lu = JSON.parse(readFileSync(join(out, 'lu.json'), 'utf8'));
    const bollard = lu.clues.find((c) => c.id === 'lu-90cv');
    assert.deepEqual(bollard.images.map((i) => i.id), [ids.bollard, ids.copy], 'the German comparison left the Luxembourg clue');
    assert.deepEqual(
      { role: bollard.images[0].role, caption: bollard.images[0].caption, giveaway: bollard.images[0].giveaway, crop: bollard.images[0].crop },
      { role: 'annotated', caption: 'Front (F) and back (B) of a bollard', giveaway: true, crop: { x: 0, y: 0, w: 0.7, h: 1 } },
    );
    assert.equal(bollard.images[1].role, undefined, 'an invalid entry is not applied');
    assert.equal(bollard.title, 'Bollard: three bolts');
    assert.equal(bollard.summary, 'Black and white bollards; count the bolts.');
    assert.deepEqual(bollard.sameAs, ['DE']);
    assert.deepEqual(bollard.differs, [{ country: 'BE', how: 'Belgian ones are white' }]);
    assert.deepEqual(lu.clues.find((c) => c.id === 'lu-kWxo').images, [], 'a rejected image is dropped');
    assert.equal(lu.clues.find((c) => c.id === 'lu-kWxo').sameAs, undefined, "a clue's own country is no sameAs");
    assert.ok(!lu.clues.some((c) => c.id === 'lu-SRxb'), 'a hidden clue is dropped');

    const { images: ri, text: rt } = result.reviews;
    assert.deepEqual([ri.files, ri.entries, ri.applied, ri.rejected], [1, 4, 1, 1]);
    assert.deepEqual(ri.countryMismatch, [{ imageId: ids.german, clueId: 'lu-90cv', clueCountry: 'LU', shows: 'DE' }]);
    assert.deepEqual(ri.unknownIds, ['ffffffffffff']);
    assert.equal(ri.invalid.length, 1);
    assert.deepEqual([rt.files, rt.applied, rt.hidden, rt.hiddenIds, rt.unknownIds], [2, 1, 1, ['lu-SRxb'], ['lu:lu-nope']]);
    assert.equal(rt.invalid.length, 2, 'the unknown code file and the bad sameAs');
  });

  it('sets dupeOf from the image hashes on every build', () => {
    const { sources, out, images, text } = setup();
    const near = { d: '0123456789abcdef', a: '0123456789abcdef' };
    writeFileSync(join(sources, 'imagehashes.json'), JSON.stringify({ [ids.bollard]: near, [ids.copy]: { ...near, d: '0123456789abcdee' }, [ids.german]: { d: 'fedcba9876543210', a: 'fedcba9876543210' } }));
    const result = writeClues({ sourcesDir: sources, outDir: out, pool, reviewImagesDir: images, reviewTextDir: text });
    const bollard = JSON.parse(readFileSync(join(out, 'lu.json'), 'utf8')).clues.find((c) => c.id === 'lu-90cv');
    assert.deepEqual(bollard.images.map((i) => i.dupeOf), [undefined, ids.bollard, undefined]);
    assert.equal(result.counts.dupes, 1);
  });
});
