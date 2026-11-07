import { label, scopeOf } from '../../app/labels';
import { Prompt } from './Prompt';
import type { CardProps } from './types';
import { useKeys } from './useKeys';

/** Binary choice between two lookalikes; arrow keys pick left or right. */
export function LookalikeCard({ card, options, outcome, onAnswer, reveal }: CardProps) {
  const [left, right] = options as [string, string];
  const scope = scopeOf(card.type);
  useKeys((event) => {
    if (event.key === 'ArrowLeft') onAnswer(left);
    if (event.key === 'ArrowRight') onAnswer(right);
  }, outcome === null);

  const state = (option: string) => {
    if (!outcome) return '';
    if (option === card.answer) return 'ok';
    return option === outcome.given ? 'bad' : 'dim';
  };

  return (
    <main className="stage stage-wide">
      <div className="scene scene-16x7 settle">
        <Prompt
          prompt={card.prompt}
          alt={`Is this ${label(left, scope)} or ${label(right, scope)}?`}
        />
      </div>
      <div className="picks rise d1">
        <button
          type="button"
          className={`pick ${state(left)}`}
          disabled={outcome !== null}
          onClick={() => onAnswer(left)}
        >
          <kbd aria-label="Left arrow">←</kbd>
          {label(left, scope)}
        </button>
        <button
          type="button"
          className={`pick ${state(right)}`}
          disabled={outcome !== null}
          onClick={() => onAnswer(right)}
        >
          {label(right, scope)}
          <kbd aria-label="Right arrow">→</kbd>
        </button>
      </div>
      {reveal}
    </main>
  );
}
