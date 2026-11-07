import { useMemo, useState } from 'react';
import { BrazilMap, digitGroups, groupOf, stateByCode } from '../../components/BrazilMap';
import { Stage } from './Stage';
import type { CardProps } from './types';

/** Pick the state for an area code on the map, in both the mcq and map modes. */
export function AreaCodeCard({ card, cards, outcome, onAnswer, reveal }: CardProps) {
  const [hover, setHover] = useState<string | null>(null);
  const digits = useMemo(() => digitGroups(cards), [cards]);
  const hovered = hover ? stateByCode.get(hover)?.name : undefined;
  return (
    <Stage
      variant="map"
      main={
        <BrazilMap
          reveal={
            outcome
              ? { answer: card.answer, picked: outcome.given, group: groupOf(card.answer, digits) }
              : undefined
          }
          onPick={onAnswer}
          onHover={setHover}
        />
      }
      side={
        <div className="code-prompt">
          <p className="kicker rise">Which state uses</p>
          <div className="areacode headline pop-in">{card.prompt.value}</div>
          <p className={hovered ? 'code-hover' : 'code-hover idle'} aria-hidden="true">
            {hovered ?? 'Pick the state on the map'}
          </p>
        </div>
      }
      reveal={reveal}
    />
  );
}
