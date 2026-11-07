import { parsePairKey } from '@metabook/core';
import type { BlockTarget } from '@metabook/core';
import { label, pairLabel } from '../../app/labels';
import { pairScope } from '../../app/stats';
import type { Content } from '../../data/content';

export function targetLabel(target: BlockTarget, content: Content): string {
  switch (target.kind) {
    case 'country':
      return label(target.key);
    case 'pair': {
      const { picked, truth } = parsePairKey(target.key);
      return pairLabel(picked, truth, pairScope(content.cards, picked, truth));
    }
    case 'chapter':
      return content.chapters.find((c) => c.id === target.key)?.title ?? target.key;
  }
}

/** Map suggestions per target, named with the same labels as the targets themselves. */
export function suggestions(targets: BlockTarget[], content: Content): string[] {
  return targets.flatMap((target) => {
    if (target.kind === 'country') return [`Play a map focused on ${label(target.key)}`];
    if (target.kind === 'pair') {
      const { picked, truth } = parsePairKey(target.key);
      const scope = pairScope(content.cards, picked, truth);
      return [`Play a map focused on ${label(truth, scope)} and ${label(picked, scope)}`];
    }
    return [];
  });
}
