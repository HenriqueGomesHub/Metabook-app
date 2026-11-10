import type { Crop } from '../data/curation';

/** Each side of a crop keeps at least this fraction of the image. */
export const MIN_SIDE = 0.2;
export const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };

export interface Point {
  x: number;
  y: number;
}

export interface CropRules {
  /** smallest side, as a fraction of the image */
  min?: number;
  /**
   * Locked shape as crop.w / crop.h in fractions (for 4:3 on a W×H image: 4H / 3W); undefined
   * leaves the aspect free.
   */
  ratio?: number;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi);

/** The fraction ratio that makes a crop 4:3 on an image of this pixel aspect (width / height). */
export const lockedRatio = (imageAspect: number) => 4 / 3 / imageAspect;

/** Smallest and largest width a crop may have under the rules. */
function widthRange({ min = MIN_SIDE, ratio }: CropRules): [number, number] {
  if (!ratio) return [min, 1];
  const lo = Math.max(min, min * ratio);
  return [lo, Math.max(lo, Math.min(1, ratio))];
}

/** Brings a crop within the image: sides between the minimum and 1, the aspect if locked, inside 0..1. */
export function clampCrop(crop: Crop, rules: CropRules = {}): Crop {
  const { min = MIN_SIDE, ratio } = rules;
  const [lo, hi] = widthRange(rules);
  const w = clamp(crop.w, lo, hi);
  const h = ratio ? clamp(w / ratio, min, 1) : clamp(crop.h, min, 1);
  return { x: clamp(crop.x, 0, 1 - w), y: clamp(crop.y, 0, 1 - h), w, h };
}

/**
 * The crop spanned from a fixed corner `anchor` to the pointer: drawing a new box, or resizing
 * with the opposite corner held. It never grows past the image on the pointer's side, and a box
 * below the minimum grows towards the pointer.
 */
export function cropFromPoints(anchor: Point, pointer: Point, rules: CropRules = {}): Crop {
  const { min = MIN_SIDE, ratio } = rules;
  const a = { x: clamp(anchor.x, 0, 1), y: clamp(anchor.y, 0, 1) };
  const right = pointer.x >= a.x;
  const down = pointer.y >= a.y;
  const roomW = right ? 1 - a.x : a.x;
  const roomH = down ? 1 - a.y : a.y;
  let w = Math.min(Math.abs(pointer.x - a.x), roomW);
  let h = Math.min(Math.abs(pointer.y - a.y), roomH);
  if (ratio) {
    w = Math.min(Math.max(w, h * ratio), roomW, roomH * ratio);
    w = Math.max(w, widthRange(rules)[0]);
    h = w / ratio;
  } else {
    w = Math.max(w, min);
    h = Math.max(h, min);
  }
  return clampCrop({ x: right ? a.x : a.x - w, y: down ? a.y : a.y - h, w, h }, rules);
}

/** The corner opposite `corner`, which stays put while that corner is dragged. */
export function oppositeCorner(crop: Crop, corner: Corner): Point {
  return {
    x: corner.endsWith('w') ? crop.x + crop.w : crop.x,
    y: corner.startsWith('n') ? crop.y + crop.h : crop.y,
  };
}

/** Moves a crop without resizing it, stopping at the image's edges. */
export function moveCrop(crop: Crop, dx: number, dy: number): Crop {
  return {
    ...crop,
    x: clamp(crop.x + dx, 0, 1 - crop.w),
    y: clamp(crop.y + dy, 0, 1 - crop.h),
  };
}

/** True when the crop keeps (practically) the whole image. */
export const isFull = (crop: Crop) =>
  crop.x < 0.001 && crop.y < 0.001 && crop.w > 0.999 && crop.h > 0.999;

/** Four decimals for storage, still inside the image. */
export function roundCrop(crop: Crop): Crop {
  const r = (v: number) => Math.round(v * 10_000) / 10_000;
  const x = r(crop.x);
  const y = r(crop.y);
  return { x, y, w: Math.min(r(crop.w), r(1 - x)), h: Math.min(r(crop.h), r(1 - y)) };
}
