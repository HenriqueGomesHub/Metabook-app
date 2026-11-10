import { describe, expect, it } from 'vitest';
import {
  clampCrop,
  cropFromPoints,
  isFull,
  lockedRatio,
  moveCrop,
  oppositeCorner,
  roundCrop,
} from './cropGeometry';

const close = (actual: object, expected: Record<string, number>) => {
  for (const [key, value] of Object.entries(expected))
    expect((actual as Record<string, number>)[key]).toBeCloseTo(value, 6);
};

describe('crop geometry', () => {
  it('clamps a crop inside the image and keeps each side at least 20%', () => {
    close(clampCrop({ x: -0.3, y: 0.95, w: 0.05, h: 0.1 }), { x: 0, y: 0.8, w: 0.2, h: 0.2 });
    close(clampCrop({ x: 0.5, y: 0.5, w: 1.4, h: 2 }), { x: 0, y: 0, w: 1, h: 1 });
    close(clampCrop({ x: 0.7, y: 0.1, w: 0.5, h: 0.3 }), { x: 0.5, y: 0.1, w: 0.5, h: 0.3 });
  });

  it('draws from the press to the pointer, in any direction, within the image', () => {
    close(cropFromPoints({ x: 0.1, y: 0.2 }, { x: 0.6, y: 0.7 }), {
      x: 0.1,
      y: 0.2,
      w: 0.5,
      h: 0.5,
    });
    // dragged up-left and past the edges: stops at 0
    close(cropFromPoints({ x: 0.5, y: 0.6 }, { x: -0.4, y: -1 }), { x: 0, y: 0, w: 0.5, h: 0.6 });
    // dragged past the right and bottom edges
    close(cropFromPoints({ x: 0.3, y: 0.3 }, { x: 1.5, y: 1.2 }), {
      x: 0.3,
      y: 0.3,
      w: 0.7,
      h: 0.7,
    });
  });

  it('grows a too-small box to the minimum, staying inside the image', () => {
    close(cropFromPoints({ x: 0.5, y: 0.5 }, { x: 0.52, y: 0.51 }), {
      x: 0.5,
      y: 0.5,
      w: 0.2,
      h: 0.2,
    });
    // no room on the pointer's side: the box is pushed back inside
    close(cropFromPoints({ x: 0.95, y: 0.95 }, { x: 0.99, y: 0.99 }), {
      x: 0.8,
      y: 0.8,
      w: 0.2,
      h: 0.2,
    });
    close(cropFromPoints({ x: 0.05, y: 0.5 }, { x: 0.04, y: 0.1 }), {
      x: 0,
      y: 0.1,
      w: 0.2,
      h: 0.4,
    });
  });

  it('resizes from the opposite corner', () => {
    const crop = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
    close(oppositeCorner(crop, 'nw'), { x: 0.6, y: 0.6 });
    close(oppositeCorner(crop, 'ne'), { x: 0.2, y: 0.6 });
    close(oppositeCorner(crop, 'se'), { x: 0.2, y: 0.2 });
    close(cropFromPoints(oppositeCorner(crop, 'se'), { x: 0.9, y: 0.5 }), {
      x: 0.2,
      y: 0.2,
      w: 0.7,
      h: 0.3,
    });
    // shrunk past the minimum: stops at 20%
    close(cropFromPoints(oppositeCorner(crop, 'se'), { x: 0.25, y: 0.21 }), {
      x: 0.2,
      y: 0.2,
      w: 0.2,
      h: 0.2,
    });
  });

  it('keeps 4:3 when locked, on the image’s own pixel aspect', () => {
    // a 2:1 image: 4:3 in pixels is w/h = 2/3 in fractions
    const ratio = lockedRatio(2);
    const drawn = cropFromPoints({ x: 0, y: 0 }, { x: 0.4, y: 0.3 }, { ratio });
    expect((drawn.w * 2) / drawn.h).toBeCloseTo(4 / 3, 6);
    const whole = clampCrop({ x: 0, y: 0, w: 1, h: 1 }, { ratio });
    close(whole, { w: 2 / 3, h: 1 });
    // never below the minimum on either side
    const tiny = clampCrop({ x: 0.5, y: 0.5, w: 0.01, h: 0.01 }, { ratio });
    expect(tiny.w).toBeGreaterThanOrEqual(0.2);
    expect(tiny.h).toBeGreaterThanOrEqual(0.2);
    expect(tiny.y + tiny.h).toBeLessThanOrEqual(1);
  });

  it('moves without resizing and stops at the edges', () => {
    const crop = { x: 0.6, y: 0.1, w: 0.3, h: 0.3 };
    close(moveCrop(crop, 0.5, -0.5), { x: 0.7, y: 0, w: 0.3, h: 0.3 });
    close(moveCrop(crop, -0.1, 0.1), { x: 0.5, y: 0.2 });
  });

  it('rounds for storage without leaving the image, and knows a whole-image crop', () => {
    const r = roundCrop({ x: 0.123456, y: 0.66667, w: 0.87654321, h: 0.33333 });
    expect(r).toEqual({ x: 0.1235, y: 0.6667, w: 0.8765, h: 0.3333 });
    expect(r.x + r.w).toBeLessThanOrEqual(1);
    expect(isFull({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(isFull({ x: 0, y: 0, w: 0.9, h: 1 })).toBe(false);
  });
});
