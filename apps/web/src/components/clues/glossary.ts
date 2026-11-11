// GeoGuessr words the clue summaries use without explaining: shown as a tappable term with a
// one-line meaning, so "Gen 3" or "snorkel" is learnable by someone who has never heard it.

export interface GlossaryEntry {
  /** how the term is matched in text (case-insensitive, whole word) */
  match: RegExp;
  term: string;
  meaning: string;
}

const entry = (pattern: string, term: string, meaning: string): GlossaryEntry => ({
  match: new RegExp(`\\b(?:${pattern})\\b`, 'i'),
  term,
  meaning,
});

export const GLOSSARY: GlossaryEntry[] = [
  entry(
    'Gen ?1',
    'Gen 1',
    'The first Street View camera (about 2007–08): very blurry and low quality. Rare today.',
  ),
  entry(
    'Gen ?2',
    'Gen 2',
    'An early camera (about 2008–09): blurry, with a soft glow round bright areas.',
  ),
  entry(
    'Gen ?3',
    'Gen 3',
    'The camera used from about 2009: sharper than Gen 2, with softer, slightly washed-out colours.',
  ),
  entry(
    'Gen ?4',
    'Gen 4',
    'The current camera (from about 2017): the sharpest, most colourful imagery.',
  ),
  entry(
    'trekkers?',
    'Trekker',
    'Street View taken by a person carrying the camera on a backpack (trails, cities), not a car.',
  ),
  entry(
    'snorkel',
    'Snorkel',
    'A raised air-intake pipe on the side of the car, beside the windscreen; you see it by looking down at the car.',
  ),
  entry(
    'roof rack',
    'Roof rack',
    'Bars on the car roof under the camera, visible when you look straight down.',
  ),
  entry(
    'antennas?',
    'Antenna',
    'The thin rod or fin on the car under the camera; its shape and place tell some countries apart.',
  ),
  entry(
    'A-type',
    'A-type antenna',
    'One shape of antenna on the car, named after its outline; look down at the car to see it.',
  ),
  entry(
    'follow car',
    'Follow car',
    'A second car visible behind the Google car in some countries (often an escort).',
  ),
  entry(
    'blur',
    'Blur',
    'Smudged patches on the picture, often where the car or the camera mount would be.',
  ),
  entry(
    'smudge',
    'Smudge',
    'A dirty or blurred spot on the camera lens that shows in the same place in every image of that drive.',
  ),
  entry('halo', 'Halo', 'A bright glow round the sun or other bright areas, left by the camera.'),
  entry(
    'rifts?',
    'Rift',
    'A visible seam where the camera stitched its pictures together: a jagged line or a jump in the image.',
  ),
  entry(
    'tripod',
    'Tripod',
    'Street View taken from a camera on a stand (indoors, landmarks), with a round blur at the bottom.',
  ),
  entry(
    'bollards?',
    'Bollard',
    'The short post at the road edge with a reflector; its colours and shape differ by country.',
  ),
  entry('guardrails?', 'Guardrail', 'The metal or concrete barrier along the road edge.'),
  entry('chevrons?', 'Chevron', 'The sign with arrows that marks a sharp bend.'),
  entry(
    'ladder poles?',
    'Ladder pole',
    'A concrete utility pole with holes up its length, like the rungs of a ladder.',
  ),
  entry(
    'exclaves?',
    'Exclave',
    'A piece of a country cut off from the rest of it by another country.',
  ),
];

export type Piece = string | { text: string; entry: GlossaryEntry };

/** `text` split into plain pieces and glossary terms; each term is marked once (its first use). */
export function glossed(text: string): Piece[] {
  const pieces: Piece[] = [];
  const used = new Set<GlossaryEntry>();
  let rest = text;
  while (rest) {
    let best: { index: number; length: number; entry: GlossaryEntry } | undefined;
    for (const e of GLOSSARY) {
      if (used.has(e)) continue;
      const m = e.match.exec(rest);
      if (m && (!best || m.index < best.index))
        best = { index: m.index, length: m[0].length, entry: e };
    }
    if (!best) {
      pieces.push(rest);
      break;
    }
    if (best.index > 0) pieces.push(rest.slice(0, best.index));
    pieces.push({ text: rest.slice(best.index, best.index + best.length), entry: best.entry });
    used.add(best.entry);
    rest = rest.slice(best.index + best.length);
  }
  return pieces;
}
