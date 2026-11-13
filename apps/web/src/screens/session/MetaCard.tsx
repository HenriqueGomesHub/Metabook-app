import { isClueCard } from '@metabook/core';
import { Options } from './Options';
import { Prompt } from './Prompt';
import { Question, Stage } from './Stage';
import type { CardProps } from './types';

/** The clue without its final full stop, to read as "Which country has: <clue>?". */
function clueText(text: string): string {
  return text.trim().replace(/[.!?]+$/, '');
}

export function MetaCard({ card, options, outcome, onAnswer, reveal }: CardProps) {
  // a text-only fact (Clue quiz) is a question about the text, not a picture to place
  const clue = isClueCard(card) && card.prompt.kind === 'text';
  return (
    <Stage
      main={
        clue ? (
          <figure className="scene settle clue-scene">
            <p className="clue">
              <span className="clue-lead">Which country has:</span> {clueText(card.prompt.value)}?
            </p>
          </figure>
        ) : (
          <figure className="scene settle" style={{ '--ar': 4 / 3 } as React.CSSProperties}>
            <Prompt prompt={card.prompt} revealed={outcome !== null} alt="Clue to place" />
          </figure>
        )
      }
      side={
        <>
          {clue ? <Question>Which country?</Question> : <Question>Where is this?</Question>}
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
