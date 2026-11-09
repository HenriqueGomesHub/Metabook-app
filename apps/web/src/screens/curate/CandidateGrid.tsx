import { useRef, useState } from 'react';
import { SUBJECTS } from '../../app/labels';
import { Button } from '../../components/Button';
import type { Candidate } from '../../data/curation';
import { mediaUrl } from '../../data/media';
import { useKeys } from '../session/useKeys';

/** Keys for tiles 1–12, in order. */
const TILE_KEYS = '1234567890-=';
const LONG_PRESS_MS = 500;

/**
 * One page of candidates as a grid. Tap a tile to mark it for rejection; "Keep the rest" approves
 * the unmarked ones. Long-press or right-click opens a photo large. Remount per page (key) to
 * clear the marks.
 */
export function CandidateGrid({
  page,
  busy,
  canUndo,
  onKeepRest,
  onUndo,
}: {
  page: Candidate[];
  busy: boolean;
  canUndo: boolean;
  onKeepRest(rejectedIds: string[]): void;
  onUndo(): void;
}) {
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
  const [viewing, setViewing] = useState<Candidate | null>(null);
  const timer = useRef<number>();
  const longPressed = useRef(false);

  const toggle = (id: string) =>
    setMarked((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const keepRest = () => onKeepRest(page.filter((c) => marked.has(c.id)).map((c) => c.id));

  useKeys((event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Enter') {
      // not also a click on whichever tile has focus
      event.preventDefault();
      keepRest();
      return;
    }
    const tile = page[TILE_KEYS.indexOf(event.key)];
    if (tile && event.key.length === 1) toggle(tile.id);
  }, !busy && !viewing);

  useKeys((event) => {
    if (event.key === 'Escape') setViewing(null);
  }, !!viewing);

  const startPress = (candidate: Candidate) => {
    longPressed.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      setViewing(candidate);
    }, LONG_PRESS_MS);
  };
  const endPress = () => window.clearTimeout(timer.current);

  return (
    <section className="sheet curate" aria-label="Photo grid">
      <div className="grid-photos">
        {page.map((candidate, i) => {
          const rejected = marked.has(candidate.id);
          const subject = SUBJECTS[candidate.subject].label;
          return (
            <button
              key={candidate.id}
              type="button"
              className="grid-tile"
              aria-pressed={rejected}
              aria-label={`Photo ${i + 1}, ${subject}${rejected ? ', rejected' : ''}`}
              style={
                candidate.preview ? { backgroundImage: `url(${candidate.preview})` } : undefined
              }
              disabled={busy}
              onClick={() => {
                // the click that ends a long-press only opens the overlay
                if (longPressed.current) longPressed.current = false;
                else toggle(candidate.id);
              }}
              onPointerDown={() => startPress(candidate)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onPointerCancel={endPress}
              onContextMenu={(event) => {
                event.preventDefault();
                endPress();
                setViewing(candidate);
              }}
            >
              <img src={mediaUrl(candidate.storagePath)} alt="" loading="lazy" decoding="async" />
              <span className="grid-key" aria-hidden="true">
                {TILE_KEYS[i]}
              </span>
              <span className="grid-label">{subject}</span>
              {rejected && (
                <span className="grid-x" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="40" height="40">
                    <path d="M6 6l12 12" />
                    <path d="M18 6 6 18" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="curate-actions">
        <Button variant="ghost" disabled={busy || !canUndo} onClick={onUndo}>
          Undo page
        </Button>
        <Button disabled={busy} onClick={keepRest}>
          <kbd>Enter</kbd>
          Keep the rest
        </Button>
      </div>

      {viewing && (
        <div className="grid-overlay" role="presentation" onClick={() => setViewing(null)}>
          <div
            className="grid-overlay-card sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Photo"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={mediaUrl(viewing.storagePath)}
              alt={viewing.title || 'Candidate photo'}
              decoding="async"
            />
            {viewing.description && <p className="note">{viewing.description}</p>}
            <a className="note" href={viewing.sourceUrl} target="_blank" rel="noreferrer">
              {viewing.credit}
            </a>
            <Button variant="ghost" autoFocus onClick={() => setViewing(null)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
