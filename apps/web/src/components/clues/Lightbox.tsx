import type { ClueImage } from '@metabook/core';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ClueImg } from './ClueImg';

/** Horizontal travel (px) that counts as a swipe. */
const SWIPE_PX = 40;

/**
 * A clue's images over the whole screen, one at a time: the image large, its caption (or the
 * clue's summary) under it, left and right through the rest. Esc, the close button or a tap on
 * the backdrop closes it; arrow keys and swipes move between images.
 */
export function Lightbox({
  images,
  start = 0,
  alt,
  fallbackCaption,
  onClose,
}: {
  images: ClueImage[];
  start?: number;
  /** the dialog's name, e.g. the clue's title */
  alt: string;
  /** shown under images without a caption */
  fallbackCaption?: string;
  onClose(): void;
}) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, start), images.length - 1));
  const swipe = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const count = images.length;
  const step = (by: number) => setIndex((i) => (i + by + count) % count);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight' && count > 1) setIndex((i) => (i + 1) % count);
      else if (event.key === 'ArrowLeft' && count > 1) setIndex((i) => (i - 1 + count) % count);
      else if (event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
    };
    // capture, so the session's own keys (Space, 1–4) do not act behind the viewer
    window.addEventListener('keydown', onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
    };
  }, [onClose, count]);

  const image = images[index];
  if (!image) return null;
  const caption = image.caption ?? fallbackCaption;

  const onPointerDown = (event: ReactPointerEvent) => {
    swipe.current = event.clientX;
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    const from = swipe.current;
    swipe.current = null;
    if (from === null || count < 2) return;
    const dx = event.clientX - from;
    if (Math.abs(dx) >= SWIPE_PX) step(dx < 0 ? 1 : -1);
  };

  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <figure
        className="lightbox-figure"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={(event) => event.target === event.currentTarget && onClose()}
      >
        <div className="lightbox-frame">
          <ClueImg key={image.id} image={image} alt={caption ?? alt} />
        </div>
        <figcaption className="lightbox-caption">
          {caption && <span>{caption}</span>}
          {count > 1 && (
            <span className="lightbox-count">
              {index + 1} / {count}
            </span>
          )}
        </figcaption>
      </figure>
      {count > 1 && (
        <>
          <button
            type="button"
            className="chip lightbox-nav lightbox-prev"
            aria-label="Previous image"
            onClick={() => step(-1)}
          >
            <svg className="icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="m15 5-7 7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            className="chip lightbox-nav lightbox-next"
            aria-label="Next image"
            onClick={() => step(1)}
          >
            <svg className="icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </button>
        </>
      )}
      <button
        ref={closeRef}
        type="button"
        className="chip lightbox-close"
        aria-label="Close"
        onClick={onClose}
      >
        <svg className="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M6 6l12 12" />
          <path d="M18 6 6 18" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
