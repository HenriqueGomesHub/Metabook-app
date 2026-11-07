import { Options } from './Options';
import { Prompt } from './Prompt';
import { Question, Stage } from './Stage';
import type { CardProps } from './types';

export function MetaCard({ card, options, outcome, onAnswer, reveal }: CardProps) {
  return (
    <Stage
      main={
        <figure className="scene settle" style={{ '--ar': 4 / 3 } as React.CSSProperties}>
          <Prompt prompt={card.prompt} alt="Clue to place" />
        </figure>
      }
      side={
        <>
          <Question>Where is this?</Question>
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
