import type { Card, SessionItem } from '@metabook/core';
import { label, scopeOf } from '../../app/labels';
import type { RevealProps } from './Reveal';
import type { Outcome } from './types';

/** Headline and one detail line for the reveal; shared with the placement test. */
export function verdictFor(
  card: Card,
  item: Pick<SessionItem, 'mode' | 'contrastPair'>,
  outcome: Outcome,
): Pick<RevealProps, 'verdict' | 'tone' | 'detail'> {
  const scope = scopeOf(card.type);
  const answer = label(card.answer, scope);
  if (outcome.correct) return { verdict: 'Got it', tone: 'right', detail: answer };
  if (!outcome.given) return { verdict: `It’s ${answer}`, tone: 'neutral' };
  const detail = item.contrastPair
    ? 'Streak reset'
    : item.mode === 'recall' || item.mode === 'map' || card.type === 'areacode'
      ? `You said ${label(outcome.given, scope)}`
      : undefined;
  return { verdict: `Not quite — it’s ${answer}`, tone: 'wrong', detail };
}
