import { useState } from 'react';
import { glossed, type GlossaryEntry } from './glossary';

/**
 * Text with its GeoGuessr jargon tappable: a tap shows the term's one-line meaning under the
 * paragraph, so a summary that says "Gen 3" still teaches someone who has never heard it.
 */
export function Glossed({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState<GlossaryEntry | null>(null);
  const pieces = glossed(text);
  return (
    <>
      <p className={className}>
        {pieces.map((piece, i) =>
          typeof piece === 'string' ? (
            piece
          ) : (
            <button
              key={i}
              type="button"
              className="term"
              aria-expanded={open === piece.entry}
              onClick={() => setOpen(open === piece.entry ? null : piece.entry)}
            >
              {piece.text}
            </button>
          ),
        )}
      </p>
      {open && (
        <p className="term-meaning" role="note">
          <b>{open.term}:</b> {open.meaning}
        </p>
      )}
    </>
  );
}
