import { describe, expect, it } from 'vitest';
import {
  CLUE_COUNTRIES,
  CLUE_NAMES,
  CLUE_POOL,
  BR_POLE,
  PL_BOLLARD,
  PL_KASHUBIAN,
  PL_POLE,
} from './__fixtures__/clues';
import {
  applyClueOverrides,
  clueCards,
  clueSummary,
  orderRoundClues,
  plainText,
  regionMatches,
  streetViewEmbedUrl,
  isGalleryClue,
  isRareClue,
  namesPartOfCountry,
} from './clueCards';
import { clueCardIds, primaryCardId } from './clues';
import { isClueCard } from './generate';

const input = { clues: CLUE_COUNTRIES, pool: CLUE_POOL, names: CLUE_NAMES };
const cards = clueCards(input);
const byId = (id: string) => cards.find((c) => c.id === id);

describe('clueCards', () => {
  it('makes Spot it cards with stable ids, the image as prompt and credit', () => {
    const spot = byId(clueCardIds.spot('PL-vySo', 'a1b2c3'));
    expect(spot).toMatchObject({
      type: 'spot',
      country: 'PL',
      answer: 'Poland',
      subject: 'bollard',
      source: 'https://www.plonkit.net/poland',
      credit: { source: 'Plonk It', licence: 'CC BY-NC-SA 4.0' },
      prompt: { kind: 'image', value: 'https://www.plonkit.net/images/poland/Poland-bollard.png' },
      clue: { id: 'PL-vySo', image: { id: 'a1b2c3' } },
    });
    expect(spot?.id).toBe('clue:PL-vySo:spot:a1b2c3');
    expect(primaryCardId(PL_BOLLARD)).toBe(spot?.id);
  });

  it('offers four distinct options: the answer, lookalikes first, never duplicates', () => {
    const spot = byId(clueCardIds.spot('PL-vySo', 'a1b2c3'))!;
    expect(spot.options).toHaveLength(4);
    expect(new Set(spot.options).size).toBe(4);
    expect(spot.options).toContain('Poland');
    expect(spot.options).toContain('Ukraine');
    // same continent before anywhere else
    expect(spot.options).not.toContain('Japan');
    expect(spot.options).not.toContain('Brazil');
    for (const card of cards.filter((c) => c.type !== 'which')) {
      expect(new Set(card.options).size).toBe(card.options?.length);
      expect(card.options?.filter((o) => o === card.answer)).toHaveLength(1);
    }
  });

  it('fills options from other continents when the continent runs short', () => {
    const spot = byId(clueCardIds.spot('BR-p001', 'b7a5e1'))!;
    expect(spot.options).toHaveLength(4);
    expect(spot.options).toContain('Argentina');
    expect(spot.options).toContain('Brazil');
  });

  it('is deterministic, whatever the input order', () => {
    const reversed = clueCards({
      ...input,
      clues: [...CLUE_COUNTRIES].reverse().map((c) => ({ ...c, clues: [...c.clues].reverse() })),
    });
    expect(reversed).toEqual(cards);
    expect(clueCards(input)).toEqual(cards);
  });

  it('leaves giveaway images out of drills unless they are cropped', () => {
    const ids = cards.filter((c) => c.clue?.id === PL_POLE.id).map((c) => c.id);
    expect(ids).toContain(clueCardIds.spot('PL-doge', 'd4e5f6'));
    expect(ids).toContain(clueCardIds.spot('PL-doge', 'aa0002'));
    expect(ids).not.toContain(clueCardIds.spot('PL-doge', 'aa0001'));
  });

  it('makes a Which clue card with same-family images from other countries, lookalikes first', () => {
    const which = byId(clueCardIds.which('PL-vySo'))!;
    expect(which).toMatchObject({
      type: 'which',
      answer: 'a1b2c3',
      prompt: { kind: 'text', value: 'Which is the Poland bollard?' },
    });
    expect(which.options).toHaveLength(4);
    expect(new Set(which.options).size).toBe(4);
    expect(which.options).toContain('a1b2c3');
    expect(which.options).toContain('ua0001');
    expect(which.clue?.choices?.map((c) => c.image.id)).toEqual(which.options);
    const countries = which.clue!.choices!.map((c) => c.country);
    expect(new Set(countries).size).toBe(4);
    // not enough other countries with poles: no Which card
    expect(byId(clueCardIds.which('PL-doge'))).toBeUndefined();
  });

  it('makes a Live view card per location with a pano only', () => {
    const live = cards.filter((c) => c.type === 'live' && c.clue?.id === BR_POLE.id);
    expect(live.map((c) => c.id)).toEqual([clueCardIds.live('BR-p001', 0)]);
    expect(live[0]?.prompt).toEqual({
      kind: 'embed',
      value:
        'https://www.google.com/maps/embed?pb=!4v0!6m8!1m7!1sbrPano000000000000000A!2m2!1d-23.55!2d-46.63!3f10!4f0!5f1',
    });
    expect(streetViewEmbedUrl({ ...BR_POLE.locations[1]! })).toBeUndefined();
  });

  it('turns clues without a usable image into Clue quiz text cards that never name the country', () => {
    const text = byId(clueCardIds.text(PL_KASHUBIAN.id))!;
    expect(isClueCard(text)).toBe(true);
    expect(text.prompt.value).toMatch(/^In the north, around Gdańsk/);
    expect(text.prompt.value).not.toMatch(/\*|\]\(/);
    // "Polish uses…" names the country by demonym: no card
    expect(byId(clueCardIds.text('PL-lang'))).toBeUndefined();
    for (const card of cards.filter(isClueCard)) {
      expect(card.prompt.value).not.toMatch(/poland|polish|warsaw/i);
    }
    // clues with images get no text card
    expect(byId(clueCardIds.text(PL_BOLLARD.id))).toBeUndefined();
  });

  it('applies image overrides: hidden images go, crops make giveaways usable', () => {
    const fixed = applyClueOverrides(CLUE_COUNTRIES, [
      { imageId: 'd4e5f6', clueId: 'PL-doge', crop: null, hidden: true },
      { imageId: 'aa0001', clueId: 'PL-doge', crop: { x: 0, y: 0, w: 0.5, h: 0.5 }, hidden: false },
    ]);
    const ids = clueCards({ ...input, clues: fixed }).map((c) => c.id);
    expect(ids).not.toContain(clueCardIds.spot('PL-doge', 'd4e5f6'));
    expect(ids).toContain(clueCardIds.spot('PL-doge', 'aa0001'));
    expect(applyClueOverrides(CLUE_COUNTRIES, [])).toBe(CLUE_COUNTRIES);
  });
});

describe('clue text', () => {
  it('reduces markdown to plain text', () => {
    expect(plainText('A **red strip** and *italic* [link](https://x.y) text')).toBe(
      'A red strip and italic link text',
    );
  });

  it('summarises the first paragraph that is not a note, within whole sentences', () => {
    expect(clueSummary({ text: ['NOTE: skip me.', 'Short one.'] })).toBe('Short one.');
    const long = `${'Word '.repeat(30).trim()}. ${'More '.repeat(40).trim()}.`;
    expect(clueSummary({ text: [long] })).toBe(`${'Word '.repeat(30).trim()}.`);
  });
});

describe('orderRoundClues', () => {
  const pl = CLUE_COUNTRIES[0]!.clues;

  it('puts region matches first, then clues near the spot, then the rest in Plonk It order', () => {
    const order = orderRoundClues(pl, {
      region: 'Pomeranian',
      lat: 48.6,
      lng: 22.3,
    }).map((c) => c.id);
    expect(order).toEqual(['PL-kash', 'PL-vySo', 'PL-doge', 'PL-lang']);
  });

  it('keeps Plonk It order without a region or a spot', () => {
    expect(orderRoundClues(pl, {}).map((c) => c.id)).toEqual([
      'PL-vySo',
      'PL-doge',
      'PL-lang',
      'PL-kash',
    ]);
  });

  it('matches regions ignoring case, accents and suffixes', () => {
    expect(regionMatches('Pomeranian Voivodeship', 'pomeranian')).toBe(true);
    expect(regionMatches('São Paulo', 'Sao Paulo')).toBe(true);
    expect(regionMatches('North', undefined)).toBe(false);
  });
});

describe('where in the country', () => {
  it('asks a regional clue with a map region on the map, with its photo', () => {
    const regional = { ...PL_KASHUBIAN, region: 'Pomerania', regionCode: 'PM' };
    const countries = CLUE_COUNTRIES.map((c) =>
      c.country === 'PL'
        ? { ...c, clues: c.clues.map((clue) => (clue.id === PL_KASHUBIAN.id ? regional : clue)) }
        : c,
    );
    const made = clueCards({ ...input, clues: countries });
    const where = made.find((c) => c.id === clueCardIds.where(PL_KASHUBIAN.id));
    if (!regional.images.length) {
      expect(where).toBeUndefined();
      return;
    }
    expect(where).toMatchObject({
      type: 'region',
      map: 'pl',
      answer: 'PM',
      prompt: { kind: 'text', value: regional.title },
      clue: { id: PL_KASHUBIAN.id },
    });
    expect(where?.clue?.image).toBeDefined();
    expect(where?.prompt.value).not.toContain('Pomerania');
  });

  it('accepts every region a clue names as seen in', () => {
    const regional = {
      ...PL_KASHUBIAN,
      region: 'Pomerania',
      regionCode: 'PM',
      alsoRegions: ['WN'],
    };
    const countries = CLUE_COUNTRIES.map((c) =>
      c.country === 'PL'
        ? { ...c, clues: c.clues.map((clue) => (clue.id === PL_KASHUBIAN.id ? regional : clue)) }
        : c,
    );
    const where = clueCards({ ...input, clues: countries }).find(
      (c) => c.id === clueCardIds.where(PL_KASHUBIAN.id),
    );
    if (regional.images.length) expect(where).toMatchObject({ answer: 'PM', spans: ['WN'] });
  });

  it('makes no map card for a clue without a region code', () => {
    expect(cards.some((c) => c.id.endsWith(':where'))).toBe(false);
  });
});

describe('isGalleryClue', () => {
  it('knows a gallery by its title or its generated summary', () => {
    expect(isGalleryClue({ title: 'Bollard: more examples' })).toBe(true);
    expect(
      isGalleryClue({
        title: 'Give way sign: design',
        summary: 'Give way signs you can see here.',
      }),
    ).toBe(true);
    expect(
      isGalleryClue({
        title: 'Speed sign: design',
        summary: 'Speed limit signs seen here: 20, 30.',
      }),
    ).toBe(true);
    expect(
      isGalleryClue({
        title: 'Bollard: red cap',
        summary: 'Red-capped bollards, seen mostly in the north.',
      }),
    ).toBe(false);
  });
});

describe('isRareClue', () => {
  it('knows clues the source calls rare and clues about one spot', () => {
    expect(
      isRareClue({ title: 'Bollard: Romania', summary: 'Bollards are fairly rare here.' }),
    ).toBe(true);
    expect(isRareClue({ title: 'Road: windy', summary: 'A skinny road with 28 hairpins.' })).toBe(
      true,
    );
    expect(isRareClue({ title: 'Car', summary: 'Seen around one central town.' })).toBe(true);
    expect(
      isRareClue({ title: 'Bollard: red cap', summary: 'Red-capped bollards everywhere.' }),
    ).toBe(false);
  });
});

describe('namesPartOfCountry', () => {
  it('finds clues for one place or part of a country', () => {
    for (const text of [
      'Off-centre crossbars appear in Otago, Marlborough and Wellington.',
      'Around Locumba, half-buried bollards line the road.',
      'Yellow taxis are found in the capital.',
      'The RN65 has light grainy pavement.',
      'A mosque in western Kasur has a green dome.',
      'Wooden poles in some states.',
      'Corn is found on the North Island only, in the far north.',
    ])
      expect(namesPartOfCountry(text), text).toBe(true);
  });

  it('leaves country-wide clues alone, even when they name other countries or a script', () => {
    for (const text of [
      'Snow poles are made of wood and painted in many different colours.',
      'Double guardrails are much less common in other South American countries.',
      'Signs are written in Cyrillic, like in Russia.',
      'Window shutters are more common here than in Czechia.',
      'Wind turbines are much more common than in any other European country.',
    ])
      expect(namesPartOfCountry(text), text).toBe(false);
  });
});
