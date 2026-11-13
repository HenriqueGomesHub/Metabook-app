import type { ClueLocation } from '@metabook/core';
import { streetViewEmbedUrl } from '@metabook/core';
import { useEffect, useState } from 'react';

/** Seconds before "Show" appears on a view that opens facing away from its clue. */
const SHOW_AFTER_S = 10;

/**
 * The official Street View spot of a clue, through Google's keyless share embed (it only works
 * inside an iframe, and its URL carries the heading). While `locked`, Google's address card in
 * the top-left corner (road, region, "View on Google Maps") is covered, and a transparent layer
 * keeps the view from being moved or clicked through to Maps; once answered, both go and the
 * learner can look around.
 *
 * `awayBy` (degrees) opens the view facing away from the clue, to be found: the learner may drag
 * to look around (the address card and the corner links stay covered), and after 10 s "Show"
 * reloads the view facing the clue (the embed cannot be turned from outside). `onShown` reports it.
 */
export function LiveView({
  location,
  locked,
  title = 'Street View',
  awayBy = 0,
  onShown,
}: {
  location: ClueLocation;
  locked: boolean;
  title?: string;
  awayBy?: number;
  onShown?(): void;
}) {
  const [lookingAway, setLookingAway] = useState(awayBy !== 0);
  const [canShow, setCanShow] = useState(false);
  const away = lookingAway && awayBy !== 0;
  useEffect(() => {
    if (!away || !locked) return;
    const timer = window.setTimeout(() => setCanShow(true), SHOW_AFTER_S * 1000);
    return () => window.clearTimeout(timer);
  }, [away, locked]);
  // answered, the view faces the clue, so the reveal points at what decided it
  const turned = away && locked;
  const src = streetViewEmbedUrl(
    turned ? { ...location, heading: (location.heading + awayBy) % 360 } : location,
  );
  if (!src) return <p className="clue">No Street View for this spot</p>;
  const searching = locked && away;
  return (
    <div className={`live-view${locked ? ' locked' : ''}`}>
      <iframe
        key={src}
        src={src}
        title={title}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {locked && (
        <>
          {/* facing away, the view can be dragged; facing the clue it cannot be moved at all */}
          {!searching && <div className="live-shield" data-testid="live-shield" />}
          {/* covers Street View's address box; nothing to read */}
          <div className="live-cover" aria-hidden="true" data-testid="live-cover" />
          {searching && <div className="live-corners" aria-hidden="true" />}
          {searching && canShow && (
            <button
              type="button"
              className="live-show"
              onClick={() => {
                setLookingAway(false);
                onShown?.();
              }}
            >
              Show
            </button>
          )}
        </>
      )}
    </div>
  );
}
