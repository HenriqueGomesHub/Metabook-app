import type { ClueCredit } from '@metabook/core';

/**
 * "Source: Plonk It (CC BY-NC-SA 4.0)", linking to the page the clue comes from. `compact` keeps
 * it to one line (the answer panel).
 */
export function Credit({ credit, compact }: { credit: ClueCredit; compact?: boolean }) {
  return (
    <p className={compact ? 'clue-credit compact' : 'clue-credit'}>
      Source:{' '}
      <a href={credit.url} target="_blank" rel="noreferrer noopener">
        {credit.source}
      </a>{' '}
      ({credit.licence})
    </p>
  );
}
