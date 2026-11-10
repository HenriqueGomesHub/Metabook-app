import { useState } from 'react';
import { label, scopeOf } from '../../app/labels';
import { AreaCodeMap } from '../../components/AreaCodeMap';
import { Stage } from './Stage';
import type { CardProps } from './types';

/** Pick the region for an area code on the country's map, in both the mcq and map modes. */
export function AreaCodeCard({ card, cards, outcome, onAnswer, reveal }: CardProps) {
  const [hover, setHover] = useState<string | null>(null);
  const hovered = hover ? label(hover, scopeOf(card)) : undefined;
  const brazil = card.country === 'BR';
  return (
    <Stage
      variant="map"
      main={
        <AreaCodeMap
          country={card.country}
          cards={cards}
          reveal={outcome ? { answer: card.answer, picked: outcome.given } : undefined}
          onPick={onAnswer}
          onHover={setHover}
        />
      }
      side={
        <div className="code-prompt">
          <p className="kicker rise">
            {brazil ? 'Which state uses' : `${label(card.country)} · which region uses`}
          </p>
          <div className="areacode headline pop-in">{card.prompt.value}</div>
          <p className={hovered ? 'code-hover' : 'code-hover idle'} aria-hidden="true">
            {hovered ?? (brazil ? 'Pick the state on the map' : 'Pick the region on the map')}
          </p>
        </div>
      }
      reveal={reveal}
    />
  );
}
