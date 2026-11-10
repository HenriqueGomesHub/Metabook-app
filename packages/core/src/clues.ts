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
}

export interface ClueCredit {
  source: 'Plonk It' | 'Learnable Meta';
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
  tags: string[];
  images: ClueImage[];
  locations: ClueLocation[];
  /** pool codes of countries the text names as similar or sharing the clue */
  lookalikes: string[];
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
