import { Options } from './Options';
import { Prompt } from './Prompt';
import { Question, Stage } from './Stage';
import { TypedAnswer } from './TypedAnswer';
import type { CardProps } from './types';

export function ScriptCard({ card, mode, options, outcome, onAnswer, reveal }: CardProps) {
  return (
    <Stage
      main={
        <div className="pop-in">
          <Prompt
            prompt={card.prompt}
            revealed={outcome !== null}
            alt="A sign written in an unknown script"
          />
        </div>
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
