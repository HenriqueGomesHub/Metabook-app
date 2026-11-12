import type { Clue } from '@metabook/core';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ClueDetails } from './ClueDetails';
import '../fit-grid.css';
import './clues.css';

/** One whole clue over the page; Esc or the backdrop closes it, arrows move through the step. */
export function ClueSheet({
  clue,
  index,
  count,
  onStep,
  onClose,
}: {
  clue: Clue;
  /** with `count` and `onStep`: where the clue sits in a list, and left / right through it */
  index?: number;
  count?: number;
  onStep?(by: number): void;
  onClose(): void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      // the image viewer inside handles its own keys
      if (document.querySelector('.lightbox')) return;
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight' && onStep) onStep(1);
      else if (event.key === 'ArrowLeft' && onStep) onStep(-1);
      else if (event.key !== ' ' && !/^[1-9]$/.test(event.key)) return;
      // capture, so a session's own keys (Space, 1–4) do not act behind the sheet
      event.stopPropagation();
      if (event.key !== ' ' || !(event.target instanceof HTMLButtonElement)) event.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, onStep]);
  return createPortal(
    <div
      className="clue-sheet-back"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="clue-sheet" role="dialog" aria-modal="true" aria-label={clue.title}>
        <div className="clue-sheet-bar">
          <span className="muted small">
            {index !== undefined && count ? `${index + 1} / ${count}` : ''}
          </span>
          <span className="clue-sheet-nav">
            {onStep && (
              <>
                <button
                  type="button"
                  className="fit-step"
                  aria-label="Previous clue"
                  onClick={() => onStep(-1)}
                >
                  <svg
                    className="icon"
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    aria-hidden="true"
                  >
                    <path d="m15 6-6 6 6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="fit-step"
                  aria-label="Next clue"
                  onClick={() => onStep(1)}
                >
                  <svg
                    className="icon"
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    aria-hidden="true"
                  >
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </button>
              </>
            )}
            <button
              ref={closeRef}
              type="button"
              className="fit-step"
              aria-label="Close"
              onClick={onClose}
            >
              <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </span>
        </div>
        <ClueDetails key={clue.id} clue={clue} heading="h4" teachSame />
      </div>
    </div>,
    document.body,
  );
}
