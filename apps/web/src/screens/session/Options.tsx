import { label } from '../../app/labels';
import { Mark, optionState } from './Mark';
import type { Outcome } from './types';
import { useKeys } from './useKeys';

/** Multiple-choice list; keys 1 to n pick while unanswered. */
export function Options({
  options,
  answer,
  outcome,
  onPick,
  scope,
  className = 'options',
}: {
  options: string[];
  answer: string;
  outcome: Outcome | null;
  onPick(option: string): void;
  /** pass `'br'` when options are Brazilian state codes */
  scope?: 'br';
  className?: string;
}) {
  useKeys((event) => {
    const option = options[Number(event.key) - 1];
    if (option !== undefined) onPick(option);
  }, outcome === null);

  return (
    <div className={className}>
      {options.map((option, i) => {
        const { state, mark } = optionState(option, answer, outcome?.given);
        return (
          <button
            key={option}
            type="button"
            className={`opt ${state}`}
            disabled={outcome !== null}
            onClick={() => onPick(option)}
          >
            <kbd>{i + 1}</kbd>
            {label(option, scope)}
            {mark && <Mark kind={mark} />}
          </button>
        );
      })}
    </div>
  );
}
