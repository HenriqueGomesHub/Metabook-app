import { isClueCard } from '@metabook/core';
import type { Card } from '@metabook/core';
import { useState } from 'react';
import { useAppData } from '../../app/AppData';
import { SUBJECTS } from '../../app/labels';
import { ClueDetails } from '../../components/clues/ClueDetails';
import { ClueSheet } from '../../components/clues/ClueSheet';
import { Credit } from '../../components/clues/Credit';
import { Icon } from '../../components/icons';
import { clueIndex } from '../../data/clueIndex';

/**
 * The clue behind a clue card, shown in the answer panel: its family, the plain summary, what it
 * looks the same as or differs from and a row of pictures, short enough to fit the panel; the
 * whole clue (every picture with its caption, the full text) opens on a sheet.
 */
export function ClueAnswer({ card }: { card: Card }) {
  const { data } = useAppData();
  const [whole, setWhole] = useState(false);
  const clue = card.clue && data ? clueIndex(data.content).byId.get(card.clue.id) : undefined;
  if (!clue) return card.credit ? <Credit credit={card.credit} /> : null;
  return (
    <div className="reveal-clue">
      <p className="reveal-family">
        <Icon name={clue.family} size={14} />
        {SUBJECTS[clue.family].label}
        {/* the source sits on the label line; the licence is with the whole clue */}
        <a
          className="reveal-source"
          href={clue.credit.url}
          target="_blank"
          rel="noreferrer noopener"
          title={`${clue.credit.source} (${clue.credit.licence})`}
        >
          {clue.credit.source}
        </a>
      </p>
      <ClueDetails
        clue={clue}
        heading="h3"
        lookalikes={card.type === 'spot' || card.type === 'live'}
        // the Clue quiz asked with the summary itself
        lead={!isClueCard(card)}
        onMore={() => setWhole(true)}
        credit={false}
      />
      {whole && <ClueSheet clue={clue} onClose={() => setWhole(false)} />}
    </div>
  );
}
