import { Options } from './Options';
import { Prompt } from './Prompt';
import { Question, Stage } from './Stage';
import { TypedAnswer } from './TypedAnswer';
import type { CardProps } from './types';

export function FlagCard({ card, mode, options, outcome, onAnswer, reveal }: CardProps) {
  const ratio = card.prompt.ratio?.split(':');
  return (
    <Stage
      main={
        <figure className="flag-figure unfurl">
          <Prompt prompt={card.prompt} revealed={outcome !== null} alt="Flag to identify" />
          {ratio && <figcaption>{ratio.join(' : ')}</figcaption>}
        </figure>
      }
      side={
        <>
          <Question>Which country?</Question>
          {mode === 'recall' ? (
            <TypedAnswer
              label="Which country?"
              placeholder="Type a country"
              outcome={outcome}
              onAnswer={onAnswer}
            />
          ) : (
            <Options
              options={options}
              answer={card.answer}
              outcome={outcome}
              onPick={onAnswer}
              className="options rise d2"
            />
          )}
        </>
      }
      reveal={reveal}
    />
  );
}
