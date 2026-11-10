import type { Card } from '@metabook/core';
import { useAppData } from '../../app/AppData';
import { SUBJECTS } from '../../app/labels';
import { ClueDetails } from '../../components/clues/ClueDetails';
import { Credit } from '../../components/clues/Credit';
import { Icon } from '../../components/icons';
import { clueIndex } from '../../data/clueIndex';

/**
 * The clue behind a clue card, shown in the answer panel: its family, the plain summary, what it
 * looks the same as or differs from, every picture (comparison and annotated ones with their
 * captions) and the full text behind "More detail".
 */
export function ClueAnswer({ card }: { card: Card }) {
  const { data } = useAppData();
  const clue = card.clue && data ? clueIndex(data.content).byId.get(card.clue.id) : undefined;
  if (!clue) return card.credit ? <Credit credit={card.credit} /> : null;
  return (
    <div className="reveal-clue">
      <p className="reveal-family">
        <Icon name={clue.family} size={18} />
        {SUBJECTS[clue.family].label}
      </p>
      <ClueDetails
        clue={clue}
        heading="h3"
        lookalikes={card.type === 'spot' || card.type === 'live'}
      />
    </div>
  );
}
