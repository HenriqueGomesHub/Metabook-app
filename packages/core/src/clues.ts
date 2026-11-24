// The clue catalogue: one file per country at content/clues/<code>.json, written by the content
// pipeline (tools/content) from Plonk It and Learnable Meta, read by the card generator and the app.
// Never edited by hand; content/clues/SCHEMA.md describes how each field is filled.

export const CLUE_FAMILIES = [
  'bollard',
  'pole',
  'sign',
  'line',
  'guardrail',
  'plate',
  'car',
  'coverage',
  'language',
  'street',
  'architecture',
  'landscape',
  'vegetation',
  'other',
] as const;
export type ClueFamily = (typeof CLUE_FAMILIES)[number];

/** Sign kinds, only on family 'sign'. */
export const SIGN_KINDS = [
  'chevron',
  'stop',
  'giveway',
  'pedestrian',
  'speed',
  'warning',
  'direction',
  'route',
  'street',
  'back',
  'other',
] as const;
export type SignKind = (typeof SIGN_KINDS)[number];

/** An official Google Street View spot. pitch: degrees, 0 = horizon, negative = down. fov: degrees. */
export interface ClueLocation {
  pano?: string;
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
  fov: number;
  source: 'plonkit' | 'learnablemeta' | 'carmeta' | 'saved';
}

/** Fractions of the image, 0..1. */
export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ClueImage {
  /** stable: hash of `src` */
  id: string;
  /** original absolute URL */
  src: string;
  /** path in the private Supabase `clues` bucket once copied, e.g. "pl/3f9a1c.webp" */
  path?: string;
  width?: number;
  height?: number;
  /** what the drill shows; absent = the whole image */
  crop?: CropBox;
  /** true when the uncropped image reveals the answer (map, country name, flag) */
  giveaway?: boolean;
  /** the Street View spot the image was taken from, when its link carries one */
  location?: ClueLocation;
  /**
   * What the picture is, from the image review (content/review-images):
   * 'example' = one real-world instance of this clue, fit for quizzes;
   * 'comparison' = several countries or variants side by side (Learn and answer screens only);
   * 'annotated' = drawn-on letters, arrows or labels (Learn and answer screens only, with caption).
   * Absent = not reviewed yet, treated as 'example'.
   */
  role?: 'example' | 'comparison' | 'annotated';
  /** one plain sentence saying what the picture shows, e.g. "Front (F) and back (B) of a German bollard" */
  caption?: string;
  /** id of an earlier image in the same clue (or another clue of the same country) that is the same picture */
  dupeOf?: string;
}

export interface ClueCredit {
  source: 'Plonk It' | 'Learnable Meta' | 'GeoHints';
  url: string;
  licence: string;
}

export interface Clue {
  /** stable across re-fetches: `<code>-<plonk it item id>` or `<code>-lm-<meta id>` */
  id: string;
  /** index into ClueCountry.steps */
  step: number;
  /** position inside the step, Plonk It's order */
  order: number;
  family: ClueFamily;
  kind?: SignKind;
  /** short label, e.g. "Bollard: red strip" */
  title: string;
  /** markdown paragraphs as the source wrote them */
  text: string[];
  /** set when the clue only applies to part of the country */
  region?: string;
  /** the region's code on the country's regions map, when `region` is one map region */
  regionCode?: string;
  /**
   * Other regions of the same map the clue also names ("also in Lleida and Tarragona", "frequent
   * in RS, RJ, MS"): on the map, picking one of them is right too.
   */
  alsoRegions?: string[];
  /** the clue names a region of its country's map: it holds for part of the country */
  local?: boolean;
  tags: string[];
  images: ClueImage[];
  locations: ClueLocation[];
  /** pool codes of countries the text names as similar or sharing the clue */
  lookalikes: string[];
  /**
   * From the text review (content/review-text): the plain-language version shown first.
   * One or two short sentences, no jargon, says what to look for and how to use it.
   */
  summary?: string;
  /** countries where this clue looks the same, so it can't tell them apart: never quiz them against each other */
  sameAs?: string[];
  /** countries that look similar but can be told apart, with the difference in a few words */
  differs?: { country: string; how: string }[];
  credit: ClueCredit;
}

export interface ClueCountry {
  /** pool code, upper case */
  country: string;
  name: string;
  sourceUrl: string;
  /** Plonk It's own updated date for the page */
  updatedAt?: string;
  fetchedAt: string;
  steps: { title: string }[];
  clues: Clue[];
}

/**
 * Card ids made from clues. Stable as long as the clue and image ids are, so study progress survives a
 * re-fetch. The extension grades a clue through `primaryCardId`.
 */
export const clueCardIds = {
  spot: (clueId: string, imageId: string) => `clue:${clueId}:spot:${imageId}`,
  which: (clueId: string) => `clue:${clueId}:which`,
  live: (clueId: string, index: number) => `clue:${clueId}:live:${index}`,
  text: (clueId: string) => `clue:${clueId}:text`,
  /** a regional clue placed on its country's map */
  where: (clueId: string) => `clue:${clueId}:where`,
};

/** An image a drill may show: not a giveaway, unless a crop hides what gives it away. */
export const usableImage = (image: ClueImage): boolean => !image.giveaway || !!image.crop;

/** An example photo of the clue (or not reviewed yet): comparison and annotated images are not. */
export const isExampleImage = (image: ClueImage): boolean =>
  (!image.role || image.role === 'example') &&
  // a caption naming several countries side by side is a comparison, labels and all
  !/\b(?:compared|comparison|versus|vs\.?)\b/i.test(image.caption ?? '');

/** Spot it cards made from one clue at most; its other photos only show in Learn and answers. */
export const MAX_SPOT_PER_CLUE = 2;

/** The original file name of an image URL, without folder, query or extension. */
function fileName(src: string): string {
  const last = src.split(/[?#]/)[0]?.split('/').pop() ?? '';
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // keep the raw name
  }
  return name.toLowerCase().replace(/\.[a-z0-9]+$/, '');
}

const hostOf = (src: string) => /^[a-z]+:\/\/([^/]+)/i.exec(src)?.[1]?.toLowerCase() ?? '';

/**
 * Best-effort test for the same picture stored twice before the image review marks `dupeOf`: same
 * pixel size and either the same original file name, or copies on two different sites (Learnable
 * Meta re-hosts Plonk It pictures at the same size under a new name).
 */
function samePicture(a: ClueImage, b: ClueImage): boolean {
  if (!a.width || !a.height || a.width !== b.width || a.height !== b.height) return false;
  return fileName(a.src) === fileName(b.src) || hostOf(a.src) !== hostOf(b.src);
}

/** A clue's images without duplicates: those marked `dupeOf`, and repeats of an earlier picture. */
export function distinctImages(images: readonly ClueImage[]): ClueImage[] {
  const out: ClueImage[] = [];
  for (const image of images) {
    if (image.dupeOf) continue;
    if (out.some((kept) => samePicture(kept, image))) continue;
    out.push(image);
  }
  return out;
}

/**
 * The images a quiz (Spot it, Which clue) may show of a clue, in order: distinct example photos
 * that do not give the answer away, at most MAX_SPOT_PER_CLUE.
 */
export function quizImages(clue: Pick<Clue, 'images'>): ClueImage[] {
  return distinctImages(clue.images)
    .filter((image) => isExampleImage(image) && usableImage(image))
    .slice(0, MAX_SPOT_PER_CLUE);
}

/** The card that stands for the clue as a whole: its first quiz image's Spot it card, else its text card. */
export function primaryCardId(clue: Pick<Clue, 'id' | 'images'>): string {
  const first = quizImages(clue)[0];
  return first ? clueCardIds.spot(clue.id, first.id) : clueCardIds.text(clue.id);
}

/** What a card made from a clue shows of it; the app looks the clue itself up by `id`. */
export interface CardClue {
  id: string;
  /** Spot it: the image shown */
  image?: ClueImage;
  /** Live view: the Street View spot shown */
  location?: ClueLocation;
  /** Which clue: the images to pick from, in display order; option ids are their image ids */
  choices?: { country: string; clueId: string; image: ClueImage }[];
  /**
   * Country-name cards: the wider distractor pool each showing draws from (see showing.ts), in
   * rank order; the first `close` are the clue's lookalikes and "differs" countries. Countries the
   * clue looks the same in (`sameAs`, either way round) are never in it.
   */
  distractors?: string[];
  close?: number;
  /** Which clue: other countries' images each showing draws its three from, in rank order */
  alternates?: { country: string; clueId: string; image: ClueImage }[];
}

/** A correction to one clue image, kept in `clue_image_overrides` and applied over the catalogue. */
export interface ClueImageOverride {
  imageId: string;
  clueId: string;
  crop: CropBox | null;
  hidden: boolean;
}
