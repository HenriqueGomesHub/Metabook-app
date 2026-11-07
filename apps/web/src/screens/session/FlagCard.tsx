import { Options } from './Options';
import { Prompt } from './Prompt';
import { TypedAnswer } from './TypedAnswer';
import type { CardProps } from './types';

export function FlagCard({ card, mode, options, outcome, onAnswer, reveal }: CardProps) {
  const ratio = card.prompt.ratio?.split(':');
  return (
    <main className="stage stage-narrow">
      <figure className="flag-figure unfurl">
        <Prompt prompt={card.prompt} alt="Flag to identify" />
        {ratio && <figcaption className="rise d1">{ratio.join(' : ')}</figcaption>}
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
