import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Crop } from '../data/curation';
import { useKeys } from '../screens/session/useKeys';
import { Button } from './Button';
import {
  clampCrop,
  cropFromPoints,
  FULL,
  isFull,
  lockedRatio,
  moveCrop,
  oppositeCorner,
  roundCrop,
} from './cropGeometry';
import type { Corner, CropRules, Point } from './cropGeometry';

const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];
/** a press that moves less than this (fraction of the image) does not draw a new box */
const DRAW_THRESHOLD = 0.01;
const NUDGE = 0.01;
const NUDGE_FAR = 0.05;

type Drag =
  | { mode: 'draw'; anchor: Point }
  | { mode: 'resize'; anchor: Point }
  | { mode: 'move'; start: Point; from: Crop };

const centredOn = (from: Crop, to: Crop): Crop => ({
  ...to,
  x: from.x + from.w / 2 - to.w / 2,
  y: from.y + from.h / 2 - to.h / 2,
});

/**
 * Picks the part of an image to keep. Drag on the image to draw a box, drag inside it to move it,
 * drag a corner to resize; each side keeps at least 20%. Keys: Enter confirms, Esc cancels,
 * arrows nudge (Shift: further). Confirms null when the box covers the whole image.
 */
export function CropBox({
  src,
  alt,
  initial,
  size,
  busy = false,
  confirmLabel = 'Crop and keep',
  onConfirm,
  onCancel,
}: {
  src: string;
  alt: string;
  initial: Crop | null;
  /** pixel size, when known before the image loads (for the 4:3 lock) */
  size?: { width: number | null; height: number | null };
  busy?: boolean;
  confirmLabel?: string;
  onConfirm(crop: Crop | null): void;
  onCancel(): void;
}) {
  const [crop, setCrop] = useState<Crop>(initial ?? FULL);
  const [locked, setLocked] = useState(false);
  const [aspect, setAspect] = useState(size?.width && size.height ? size.width / size.height : 0);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const rulesFor = (lock: boolean): CropRules => ({
    ratio: lock ? lockedRatio(aspect || 4 / 3) : undefined,
  });
  const rules = rulesFor(locked);

  const confirm = () => onConfirm(isFull(crop) ? null : roundCrop(crop));

  const toggleLock = () => {
    const next = !locked;
    setLocked(next);
    setCrop((c) => clampCrop(centredOn(c, clampCrop(c, rulesFor(next))), rulesFor(next)));
  };
  const reset = () => setCrop(clampCrop(centredOn(FULL, clampCrop(FULL, rules)), rules));

  useKeys((event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const step = event.shiftKey ? NUDGE_FAR : NUDGE;
    const nudges: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const nudge = nudges[event.key];
    if (event.key === 'Enter') {
      // not also a click on whichever button has focus
      event.preventDefault();
      confirm();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    } else if (nudge) {
      event.preventDefault();
      const [dx, dy] = nudge;
      setCrop((c) => moveCrop(c, dx, dy));
    }
  }, !busy);

  const pointAt = (event: ReactPointerEvent): Point => {
    const box = stage.current!.getBoundingClientRect();
    return {
      x: box.width ? (event.clientX - box.left) / box.width : 0,
      y: box.height ? (event.clientY - box.top) / box.height : 0,
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (busy || event.button > 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const p = pointAt(event);
    const corner = (event.target as HTMLElement).dataset.corner as Corner | undefined;
    const inside =
      p.x >= crop.x && p.x <= crop.x + crop.w && p.y >= crop.y && p.y <= crop.y + crop.h;
    if (corner) drag.current = { mode: 'resize', anchor: oppositeCorner(crop, corner) };
    // a box over the whole image can only be drawn over, not moved
    else if (inside && !isFull(crop)) drag.current = { mode: 'move', start: p, from: crop };
    else drag.current = { mode: 'draw', anchor: p };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const p = pointAt(event);
    if (current.mode === 'move') {
      setCrop(moveCrop(current.from, p.x - current.start.x, p.y - current.start.y));
    } else if (
      current.mode === 'resize' ||
      Math.hypot(p.x - current.anchor.x, p.y - current.anchor.y) > DRAW_THRESHOLD
    ) {
      setCrop(cropFromPoints(current.anchor, p, rules));
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  const percent = (v: number) => `${Math.round(v * 100)}%`;
  const box = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.w * 100}%`,
    height: `${crop.h * 100}%`,
  };

  return (
    <div className="cropbox">
      <div
        ref={stage}
        className="cropbox-stage"
        aria-label="Crop area: drag to draw, move or resize the box"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          decoding="async"
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth && naturalHeight) setAspect(naturalWidth / naturalHeight);
          }}
        />
        <div className="cropbox-shade" aria-hidden="true">
          <div style={box} />
        </div>
        <div className="cropbox-rect" style={box}>
          {CORNERS.map((corner) => (
            <span key={corner} className={`cropbox-handle ${corner}`} data-corner={corner} />
          ))}
        </div>
      </div>
      <p className="note" aria-live="polite">
        Keeping {percent(crop.w)} × {percent(crop.h)} of the photo
      </p>
      <div className="curate-actions">
        <button type="button" className="toggle" aria-pressed={locked} onClick={toggleLock}>
          Lock 4:3
        </button>
        <Button variant="ghost" disabled={busy} onClick={reset}>
          Reset
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          <kbd>Esc</kbd>
          Cancel
        </Button>
        <Button disabled={busy} onClick={confirm}>
          <kbd>Enter</kbd>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
