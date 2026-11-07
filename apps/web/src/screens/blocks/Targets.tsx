import { suggestMaps } from '@metabook/core';
import type { BlockTarget } from '@metabook/core';
import type { Content } from '../../data/content';
import { suggestionText, targetLabel } from './targets';

export function Targets({ targets, content }: { targets: BlockTarget[]; content: Content }) {
  if (targets.length === 0) {
    return (
      <p className="note">
        No weak spots yet. Play a few games or drills first; the block still tracks your time.
      </p>
    );
  }
  return (
    <>
      <ul className="tags" aria-label="Targets">
        {targets.map((target) => (
          <li key={`${target.kind}:${target.key}`} className="tag">
            {targetLabel(target, content)}
          </li>
        ))}
      </ul>
      <ul className="suggest">
        {suggestMaps(targets).map((line) => (
          <li key={line}>{suggestionText(line, content)}</li>
        ))}
      </ul>
    </>
  );
}
