import { Options } from './Options';
import { Prompt } from './Prompt';
import { TypedAnswer } from './TypedAnswer';
import type { CardProps } from './types';

export function ScriptCard({ card, mode, options, outcome, onAnswer, reveal }: CardProps) {
  return (
    <main className="stage stage-medium">
      <figure className="script-figure">
        <div className="pop-in">
          <Prompt prompt={card.prompt} alt="A sign written in an unknown script" />
        </div>
        <figcaption className="rise d1">
          {mode === 'recall' ? 'Recall · type it' : 'Early review · pick one'}
        </figcaption>
      </figure>
      {mode === 'recall' ? (
        !outcome && (
          <TypedAnswer label="Which country?" placeholder="Type a country" onAnswer={onAnswer} />
        )
      ) : (
        <Options
          options={options}
          answer={card.answer}
          outcome={outcome}
          onPick={onAnswer}
          className="options options-grid rise d2"
        />
      )}
      {reveal}
    </main>
  );
}
