import { Options } from './Options';
import { Prompt } from './Prompt';
import type { CardProps } from './types';

export function MetaCard({ card, options, outcome, onAnswer, reveal }: CardProps) {
  return (
    <main className="stage stage-split stage-center">
      <figure className="scene scene-4x3 settle">
        <Prompt prompt={card.prompt} alt="Clue to place" />
      </figure>
      <section className="stage-side">
        {outcome ? (
          reveal
        ) : (
          <>
            <h1 className="headline question rise d1">Where is this?</h1>
            <Options
              options={options}
              answer={card.answer}
              outcome={outcome}
              onPick={onAnswer}
              className="options options-compact rise d2"
            />
          </>
        )}
      </section>
    </main>
  );
}
