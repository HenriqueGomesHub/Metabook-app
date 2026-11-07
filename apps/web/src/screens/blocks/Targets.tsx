import type { BlockTarget } from '@metabook/core';
import { EmptyState } from '../../components/EmptyState';
import type { Content } from '../../data/content';
import { suggestions, targetLabel } from './targets';

export function Targets({ targets, content }: { targets: BlockTarget[]; content: Content }) {
  if (targets.length === 0) {
    return (
      <EmptyState
        size="compact"
        title="No weak spots yet"
        text="Play a few games or drills first; the block still tracks your time."
      />
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
        {suggestions(targets, content).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
}
