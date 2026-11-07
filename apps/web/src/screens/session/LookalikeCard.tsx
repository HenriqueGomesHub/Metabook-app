import { Prompt } from './Prompt';
import type { CardProps } from './types';
import { useKeys } from './useKeys';

/** Binary choice between two lookalikes; arrow keys pick left or right. */
export function LookalikeCard({ card, options, outcome, onAnswer, reveal }: CardProps) {
  const [left, right] = options as [string, string];
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
        <Prompt prompt={card.prompt} alt={`Is this ${left} or ${right}?`} />
      </div>
      <div className="picks rise d1">
        <button
          type="button"
          className={`pick ${state(left)}`}
          disabled={outcome !== null}
          onClick={() => onAnswer(left)}
        >
          <kbd aria-label="Left arrow">←</kbd>
          {left}
        </button>
        <button
          type="button"
          className={`pick ${state(right)}`}
          disabled={outcome !== null}
          onClick={() => onAnswer(right)}
        >
          {right}
          <kbd aria-label="Right arrow">→</kbd>
        </button>
      </div>
      {reveal}
    </main>
  );
}
