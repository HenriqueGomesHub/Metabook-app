import { LiveView } from '../../components/clues/LiveView';
import { Options } from './Options';
import { Question, Stage } from './Stage';
import type { CardProps } from './types';

/** Live view: a clue's official Street View spot, locked until answered, "Which country?". */
export function LiveCard({ card, options, outcome, onAnswer, reveal }: CardProps) {
  const location = card.clue?.location;
  return (
    <Stage
      main={
        <figure className="scene settle" style={{ '--ar': 16 / 10 } as React.CSSProperties}>
          {location ? (
            <LiveView location={location} locked={outcome === null} />
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
