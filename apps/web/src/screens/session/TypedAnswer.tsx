import { useId, useState } from 'react';
import { ArrowIcon } from '../../components/Button';

export function TypedAnswer({
  label,
  placeholder,
  onAnswer,
}: {
  label: string;
  placeholder: string;
  onAnswer(given: string): void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  return (
    <form
      className="typed rise d2"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) onAnswer(text.trim());
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="typed-row">
        <input
          id={id}
          type="text"
          placeholder={placeholder}
          autoComplete="off"
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="cta typed-submit" aria-label="Check answer">
          <ArrowIcon />
        </button>
      </div>
      <div className="typed-help">
        <span>
          <kbd>Enter</kbd> to answer
        </span>
        <span aria-hidden="true">·</span>
        <button type="button" className="link" onClick={() => onAnswer('')}>
          I don’t know
        </button>
      </div>
    </form>
  );
}
