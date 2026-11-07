import type { Outcome } from './types';
import { useKeys } from './useKeys';

/** Multiple-choice list; keys 1 to n pick while unanswered. */
export function Options({
  options,
  answer,
  outcome,
  onPick,
  className = 'options',
}: {
  options: string[];
  answer: string;
  outcome: Outcome | null;
  onPick(option: string): void;
  className?: string;
}) {
  useKeys((event) => {
    const option = options[Number(event.key) - 1];
    if (option !== undefined) onPick(option);
  }, outcome === null);

  return (
    <div className={className}>
      {options.map((option, i) => {
        let state = '';
        let mark = '';
        if (outcome) {
          if (option === answer) [state, mark] = ['ok', 'Answer'];
          else if (option === outcome.given) [state, mark] = ['bad', 'Your pick'];
          else state = 'dim';
        }
        return (
          <button
            key={option}
            type="button"
            className={`opt ${state}`}
            disabled={outcome !== null}
            onClick={() => onPick(option)}
          >
            <kbd>{i + 1}</kbd>
            {option}
            {mark && <span className="opt-mark">{mark}</span>}
          </button>
        );
      })}
    </div>
  );
}
