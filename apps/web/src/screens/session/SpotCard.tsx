import { ClueImg } from '../../components/clues/ClueImg';
import { Options } from './Options';
import { Question, Stage } from './Stage';
import type { CardProps } from './types';

/** Spot it: a clue's image (its crop), "Which country?". */
export function SpotCard({ card, options, outcome, onAnswer, reveal }: CardProps) {
  const image = card.clue?.image;
  return (
    <Stage
      main={
        <figure className="scene settle" style={{ '--ar': 4 / 3 } as React.CSSProperties}>
          {image ? (
            <ClueImg image={image} alt={card.prompt.alt ?? 'Clue to place'} cropped />
          ) : (
            <p className="clue">Image unavailable</p>
          )}
        </figure>
      }
      side={
        <>
          <Question kicker="Spot it">Which country?</Question>
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
