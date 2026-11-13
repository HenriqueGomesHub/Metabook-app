import { label, scopeOf } from '../../app/labels';
import { Mark, optionState } from './Mark';
import { Prompt } from './Prompt';
import { Question, Stage } from './Stage';
import type { CardProps } from './types';
import { useKeys } from './useKeys';

/** Binary choice between two lookalikes; arrow keys pick left or right. */
export function LookalikeCard({ card, options, outcome, onAnswer, reveal }: CardProps) {
  const [left, right] = options as [string, string];
  const scope = scopeOf(card);
  useKeys((event) => {
    if (event.key === 'ArrowLeft') onAnswer(left);
    if (event.key === 'ArrowRight') onAnswer(right);
  }, outcome === null);

  const pick = (option: string, key: 'left' | 'right') => {
    const { state, mark } = optionState(option, card.answer, outcome?.given);
    return (
      <button
        type="button"
        className={`pick ${state}`}
        disabled={outcome !== null}
        onClick={() => onAnswer(option)}
      >
        <kbd aria-label={key === 'left' ? 'Left arrow' : 'Right arrow'}>
          {key === 'left' ? '←' : '→'}
        </kbd>
        {label(option, scope)}
        {mark && <Mark kind={mark} />}
      </button>
    );
  };

  return (
    <Stage
      main={
        <div
          // a line of text is a card sized to it, not a photo frame with one line in the middle
          className={card.prompt.kind === 'text' ? 'scene settle clue-scene' : 'scene settle'}
          style={{ '--ar': 16 / 9 } as React.CSSProperties}
        >
          <Prompt
            prompt={card.prompt}
            revealed={outcome !== null}
            alt={`Is this ${label(left, scope)} or ${label(right, scope)}?`}
          />
        </div>
      }
      side={
        <>
          <Question>
            {label(left, scope)} or {label(right, scope)}?
          </Question>
          <div className="picks rise d2">
            {pick(left, 'left')}
            {pick(right, 'right')}
          </div>
        </>
      }
      reveal={reveal}
    />
  );
}
