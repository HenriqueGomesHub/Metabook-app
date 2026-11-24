import type { Card, Clue } from '@metabook/core';
import { useState } from 'react';
import { useAppData } from '../../app/AppData';
import { Button } from '../../components/Button';
import { label } from '../../app/labels';
import { clueHeading } from '../../components/clues/ClueDetails';
import { ClueSheet } from '../../components/clues/ClueSheet';
import { Credit } from '../../components/clues/Credit';
import { clueIndex } from '../../data/clueIndex';

/** A clue's tell as one line: "Bollard: black-white wedge", the family part in bold. */
export function TellLine({ clue }: { clue: Clue }) {
  const heading = clueHeading(clue);
  const at = heading.indexOf(':');
  return (
    <p className="reveal-tell">
      {at > 0 ? (
        <>
          <b>{heading.slice(0, at + 1)}</b>
          {heading.slice(at + 1)}
        </>
      ) : (
        heading
      )}
    </p>
  );
}

/** Where else the clue looks the same, from the clue's own sameAs list. */
function sameLine(clue: Clue): string | undefined {
  const names = (clue.sameAs ?? []).map((code) => label(code)).filter(Boolean);
  if (names.length === 0) return undefined;
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `Looks the same in ${list}`;
}

/**
 * The clue behind a clue card, as the reveal shows it: the tell in one line and, when the source
 * says so, where else it looks the same. The rest (the full text, every photo) is behind "More".
 */
export function ClueAnswer({ card }: { card: Card }) {
  const { data } = useAppData();
  const clue = card.clue && data ? clueIndex(data.content).byId.get(card.clue.id) : undefined;
  if (!clue) return card.credit ? <Credit credit={card.credit} /> : null;
  const same = sameLine(clue);
  return (
    <div className="reveal-clue">
      <TellLine clue={clue} />
      {same && <p className="reveal-also">{same}</p>}
    </div>
  );
}

/** "More": the whole clue on a sheet. */
export function ClueMore({ card }: { card: Card }) {
  const { data } = useAppData();
  const [open, setOpen] = useState(false);
  const clue = card.clue && data ? clueIndex(data.content).byId.get(card.clue.id) : undefined;
  if (!clue) return null;
  return (
    <>
      <Button variant="ghost" className="reveal-more" onClick={() => setOpen(true)}>
        More
      </Button>
      {open && <ClueSheet clue={clue} onClose={() => setOpen(false)} />}
    </>
  );
}
