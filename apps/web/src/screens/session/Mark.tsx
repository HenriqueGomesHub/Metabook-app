/** Check or cross drawn with a stroke animation on an answered option. */
export function Mark({ kind }: { kind: 'ok' | 'bad' }) {
  return (
    <span className={`mark mark-${kind}`}>
      <svg className="icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        {kind === 'ok' ? (
          <path pathLength={1} d="m5 12.5 4.5 4.5L19 7.5" />
        ) : (
          <>
            <path pathLength={1} d="M7 7l10 10" />
            <path pathLength={1} d="M17 7 7 17" />
          </>
        )}
      </svg>
      <span className="sr-only">{kind === 'ok' ? 'Answer' : 'Your pick'}</span>
    </span>
  );
}

/** Class and mark for an option once answered: the answer glows, a wrong pick shakes. */
export function optionState(
  option: string,
  answer: string,
  given: string | undefined,
): { state: string; mark?: 'ok' | 'bad' } {
  if (given === undefined) return { state: '' };
  if (option === answer) return { state: option === given ? 'ok mine' : 'ok', mark: 'ok' };
  if (option === given) return { state: 'bad', mark: 'bad' };
  return { state: 'dim' };
}
