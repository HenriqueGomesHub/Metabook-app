import type { ClueCredit } from '@metabook/core';

/** "Source: Plonk It (CC BY-NC-SA 4.0)", linking to the page the clue comes from. */
export function Credit({ credit }: { credit: ClueCredit }) {
  return (
    <p className="clue-credit">
      Source:{' '}
      <a href={credit.url} target="_blank" rel="noreferrer noopener">
        {credit.source}
      </a>{' '}
      ({credit.licence})
    </p>
  );
}
