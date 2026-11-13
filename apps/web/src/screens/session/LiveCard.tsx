import { useState } from 'react';
import { LiveView } from '../../components/clues/LiveView';
import { Options } from './Options';
import { Question, Stage } from './Stage';
import type { CardProps } from './types';

/**
 * Live view: a clue's official Street View spot, "Which country?". It opens facing the clue,
 * locked until answered; once the clue is well known it opens facing away, to be found.
 */
export function LiveCard({ card, options, outcome, onAnswer, reveal, mature }: CardProps) {
  const location = card.clue?.location;
  // a well-known clue is found, not shown: the view opens 90–180° away from it
  const [awayBy] = useState(() => (mature ? 90 + Math.round(Math.random() * 90) : 0));
  return (
    <Stage
      main={
        <figure className="scene settle" style={{ '--ar': 16 / 10 } as React.CSSProperties}>
          {location ? (
            <LiveView location={location} locked={outcome === null} awayBy={awayBy} />
          ) : (
            <p className="clue">Street View unavailable</p>
          )}
        </figure>
      }
      side={
        <>
          <Question kicker="Live view">Which country?</Question>
          <Options
            options={options}
            answer={card.answer}
            outcome={outcome}
            onPick={onAnswer}
            className="options options-compact rise d2"
          />
        </>
      }
      reveal={reveal}
    />
  );
}
