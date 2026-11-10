import type { Clue, ClueImage } from '@metabook/core';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { label } from '../../app/labels';
import { ClueImg } from './ClueImg';
import { Credit } from './Credit';
import { Lightbox } from './Lightbox';
import { Markdown } from './Markdown';
import './clues.css';

/**
 * One clue as Plonk It wrote it: title, text, images (tap to enlarge), region, lookalikes and the
 * credit line. `children` go at the bottom (the round screen's buttons).
 */
export function ClueDetails({
  clue,
  heading: Heading = 'h3',
  images = true,
  lookalikes = true,
  children,
}: {
  clue: Clue;
  heading?: 'h2' | 'h3' | 'h4';
  images?: boolean;
  lookalikes?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState<ClueImage | null>(null);
  return (
    <article className="clue-details">
      <Heading className="clue-title">{clue.title}</Heading>
      {clue.region && <span className="learn-region">{clue.region}</span>}
      {images && clue.images.length > 0 && (
        <div className="clue-images">
          {clue.images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              className="clue-thumb"
              aria-label={`Enlarge image ${i + 1} of ${clue.title}`}
              onClick={() => setOpen(image)}
            >
              <ClueImg image={image} alt="" fit="cover" />
            </button>
          ))}
        </div>
      )}
      <div className="clue-text">
        <Markdown paragraphs={clue.text} />
      </div>
      {lookalikes && clue.lookalikes.length > 0 && (
        <p className="clue-lookalikes">
          <span>Lookalikes</span>
          {clue.lookalikes.map((code) => (
            <span key={code} className="clue-chip">
              {label(code)}
            </span>
          ))}
        </p>
      )}
      <Credit credit={clue.credit} />
      {children}
      {open && <Lightbox image={open} alt={clue.title} onClose={() => setOpen(null)} />}
    </article>
  );
}
