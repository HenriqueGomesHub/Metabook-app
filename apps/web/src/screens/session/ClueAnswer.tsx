import type { Card } from '@metabook/core';
import { useAppData } from '../../app/AppData';
import { ClueDetails } from '../../components/clues/ClueDetails';
import { Credit } from '../../components/clues/Credit';
import { clueIndex } from '../../data/clueIndex';

/** The clue behind a clue card, shown in the answer panel: title, text, images and credit. */
export function ClueAnswer({ card }: { card: Card }) {
  const { data } = useAppData();
  const clue = card.clue && data ? clueIndex(data.content).byId.get(card.clue.id) : undefined;
  if (!clue) return card.credit ? <Credit credit={card.credit} /> : null;
  return (
    <div className="reveal-clue">
      <ClueDetails
        clue={clue}
        heading="h3"
        lookalikes={card.type === 'spot' || card.type === 'live'}
      />
    </div>
  );
}
