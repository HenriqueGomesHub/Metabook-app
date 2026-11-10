import type { ClueLocation } from '@metabook/core';
import { streetViewEmbedUrl } from '@metabook/core';

/**
 * The official Street View spot of a clue, through Google's keyless share embed (it only works
 * inside an iframe). While `locked`, Google's address card in the top-left corner (road, region,
 * "View on Google Maps") is covered, and a transparent layer keeps the view from being moved or
 * clicked through to Maps; once answered, both go and the learner can look around.
 */
export function LiveView({
  location,
  locked,
  title = 'Street View',
}: {
  location: ClueLocation;
  locked: boolean;
  title?: string;
}) {
  const src = streetViewEmbedUrl(location);
  if (!src) return <p className="clue">No Street View for this spot</p>;
  return (
    <div className={`live-view${locked ? ' locked' : ''}`}>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {locked && (
        <>
          <div className="live-shield" data-testid="live-shield" />
          <div className="live-cover" aria-hidden="true">
            Location hidden
          </div>
        </>
      )}
    </div>
  );
}
