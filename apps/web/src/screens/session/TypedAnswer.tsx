import { useId, useState } from 'react';
import { ArrowIcon } from '../../components/Button';
import { Mark } from './Mark';
import type { Outcome } from './types';

/** Free-text answer; once answered it stays in place, marked right or wrong. */
export function TypedAnswer({
  label,
  placeholder,
  outcome = null,
  onAnswer,
}: {
  label: string;
  placeholder: string;
  outcome?: Outcome | null;
  onAnswer(given: string): void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const state = outcome ? (outcome.correct ? 'ok mine' : outcome.given ? 'bad' : 'dim') : '';
  return (
    <form
      className={`typed ${state}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!outcome && text.trim()) onAnswer(text.trim());
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="typed-row">
        <input
          id={id}
          type="text"
          placeholder={placeholder}
          autoComplete="off"
          autoFocus
          readOnly={outcome !== null}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        {outcome ? (
          outcome.given && <Mark kind={outcome.correct ? 'ok' : 'bad'} />
        ) : (
          <button type="submit" className="cta typed-submit" aria-label="Check answer">
            <ArrowIcon />
          </button>
        )}
      </div>
      {!outcome && (
        <div className="typed-help">
          <span>
            <kbd>Enter</kbd> to answer
          </span>
          <span aria-hidden="true">·</span>
          <button type="button" className="link" onClick={() => onAnswer('')}>
            I don’t know
          </button>
        </div>
      )}
    </form>
  );
}
