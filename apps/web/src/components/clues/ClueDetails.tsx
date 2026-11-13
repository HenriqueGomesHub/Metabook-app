import { clueSummary, distinctImages, plainText } from '@metabook/core';
import { Glossed } from './Glossed';
import type { Clue } from '@metabook/core';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { label, SUBJECTS } from '../../app/labels';
import { useClueText } from '../../data/clueText';
import { CountryList } from './CountryList';
import { ClueImg } from './ClueImg';
import { Credit } from './Credit';
import { Lightbox } from './Lightbox';
import { Markdown } from './Markdown';
import './clues.css';

/** Words after "Family:" short enough to be a raw source tag ("Shitcam", "Unique car"). */
const TAG_WORDS = 3;

/** Pictures the short answer-panel version shows. */
const COMPACT_IMAGES = 3;

/**
 * The heading a clue shows. Google car and coverage titles are often just the source's tag
 * ("Coverage: Shitcam"); with a summary to say what it means, they read as the family name.
 */
export function clueHeading(clue: Pick<Clue, 'title' | 'family' | 'summary'>): string {
  if ((clue.family === 'car' || clue.family === 'coverage') && clue.summary) {
    const rest = clue.title.replace(/^[^:]*:\s*/, '');
    if (rest === clue.title || rest.split(/\s+/).length <= TAG_WORDS) {
      return SUBJECTS[clue.family].label;
    }
  }
  return clue.title;
}

/**
 * The plain-language lead shown first: the reviewed summary, else the text's first paragraph
 * trimmed to a sentence or two (undefined until the text has loaded).
 */
export function clueLead(clue: Pick<Clue, 'summary'>, text: string[] | undefined) {
  if (clue.summary?.trim()) return { lead: clue.summary.trim(), fromText: false };
  if (!text) return undefined;
  const lead = clueSummary({ text });
  return lead ? { lead, fromText: true } : undefined;
}

/**
 * One clue, easiest first: heading, the plain-language summary in large type, what it looks the
 * same as or can be told apart from, the pictures (tap for the viewer; captions under them), and
 * the full Plonk It / Learnable Meta text behind "More detail". `children` go at the bottom (the
 * round screen's buttons).
 */
export function ClueDetails({
  clue,
  heading: Heading = 'h3',
  images = true,
  lookalikes = true,
  teachSame = false,
  lead: showLead = true,
  onMore,
  credit = true,
  children,
}: {
  clue: Clue;
  heading?: 'h2' | 'h3' | 'h4';
  images?: boolean;
  lookalikes?: boolean;
  /** Learn page: spell out what "same look" means for clues shared with other countries */
  teachSame?: boolean;
  /** false where the prompt already showed the summary (the Clue quiz) */
  lead?: boolean;
  /**
   * A short version for the answer panel: at most a row of pictures, no captions, and instead of
   * "More detail" a button calling this, which opens the whole clue
   */
  onMore?(): void;
  /** false where the source is credited beside it (the answer panel's label line) */
  credit?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const text = useClueText(clue);
  const lead = clueLead(clue, text);
  const shown = distinctImages(clue.images);
  const sameAs = clue.sameAs ?? [];
  // the answer panel does not repeat countries its lead already names ("Common in Kazakhstan too.")
  const sameShown =
    onMore && lead
      ? sameAs.filter((code) => !lead.lead.includes(label(code.toUpperCase())))
      : sameAs;
  const differs = clue.differs ?? [];
  const sameCodes = new Set(sameAs.map((code) => code.toUpperCase()));
  const differCodes = new Set(differs.map((d) => d.country.toUpperCase()));
  const otherLookalikes = clue.lookalikes.filter(
    (code) => !sameCodes.has(code.toUpperCase()) && !differCodes.has(code.toUpperCase()),
  );
  // the full text is worth opening when it says more than the lead
  const more =
    text && text.length > 0 && (!lead?.fromText || plainText(text.join(' ')) !== lead.lead);

  return (
    <article className="clue-details">
      <div className="clue-head">
        <Heading className="clue-title">{clueHeading(clue)}</Heading>
        {clue.region && <span className="learn-region">{clue.region}</span>}
      </div>
      {!showLead ? null : lead ? (
        <Glossed className="clue-summary" text={lead.lead} />
      ) : (
        text === undefined && <p className="clue-summary clue-text-loading">Loading…</p>
      )}
      {(sameShown.length > 0 || differs.length > 0) && (
        <ul className="clue-compare">
          {sameShown.length > 0 && (
            <li className="clue-same">
              <span className="clue-compare-label">Looks the same in</span>{' '}
              <CountryList codes={sameShown} title="Looks the same in" />
              {teachSame && (
                <span className="clue-compare-note">
                  {' '}
                  Same look: this clue alone can’t tell them apart, so look for another clue.
                </span>
              )}
            </li>
          )}
          {differs.map((d) => (
            <li key={d.country} className="clue-differs">
              <span className="clue-compare-label">Similar</span> {label(d.country.toUpperCase())}
              {d.how && <> — {d.how}</>}
            </li>
          ))}
        </ul>
      )}
      {images && shown.length > 0 && (
        <div className="clue-images">
          {(onMore ? shown.slice(0, COMPACT_IMAGES) : shown).map((image, i) => (
            <figure key={image.id} className="clue-figure">
              <button
                type="button"
                className="clue-thumb"
                aria-label={`Enlarge image ${i + 1} of ${clue.title}`}
                title={image.caption}
                onClick={() => setOpen(i)}
              >
                <ClueImg image={image} alt={image.caption ?? ''} fit="cover" />
              </button>
              {image.caption && !onMore && <figcaption>{image.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      {onMore && (more || shown.length > COMPACT_IMAGES || shown.some((i) => i.caption)) && (
        <button type="button" className="link clue-more-link" onClick={onMore}>
          The whole clue{shown.length > COMPACT_IMAGES ? `, all ${shown.length} pictures` : ''}
        </button>
      )}
      {!onMore && text && more && (
        <details className="clue-more">
          <summary>More detail</summary>
          <div className="clue-text">
            <Markdown paragraphs={text} />
          </div>
        </details>
      )}
      {lookalikes && otherLookalikes.length > 0 && (
        <p className="clue-lookalikes">
          <span>Lookalikes</span>
          {otherLookalikes.map((code) => (
            <span key={code} className="clue-chip">
              {label(code)}
            </span>
          ))}
        </p>
      )}
      {credit && <Credit credit={clue.credit} compact={Boolean(onMore)} />}
      {children}
      {open !== null && (
        <Lightbox
          images={shown}
          start={open}
          alt={clue.title}
          fallbackCaption={lead?.lead}
          onClose={() => setOpen(null)}
        />
      )}
    </article>
  );
}
