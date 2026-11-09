import { SUBJECT_NOUNS } from '@metabook/core';
import type { Card, SessionItem } from '@metabook/core';
import { label, scopeOf } from '../../app/labels';
import { mediaById } from '../../data/media';
import type { RevealProps } from './Reveal';
import type { Outcome } from './types';

/** Headline and one detail line for the reveal; shared with the placement test. */
export function verdictFor(
  card: Card,
  item: Pick<SessionItem, 'mode' | 'contrastPair'>,
  outcome: Outcome,
): Pick<RevealProps, 'verdict' | 'tone' | 'detail' | 'why'> {
  return { ...baseVerdict(card, item, outcome), why: card.explain };
}

function baseVerdict(
  card: Card,
  item: Pick<SessionItem, 'mode' | 'contrastPair'>,
  outcome: Outcome,
): Pick<RevealProps, 'verdict' | 'tone' | 'detail'> {
  if (card.type === 'photo-choice') return photoVerdict(card, outcome);
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

/** Photo picks answer with photo ids; the verdict names countries instead. */
function photoVerdict(
  card: Card,
  outcome: Outcome,
): Pick<RevealProps, 'verdict' | 'tone' | 'detail'> {
  const country = label(card.country);
  if (outcome.correct) return { verdict: 'Got it', tone: 'right', detail: country };
  const picked = mediaById.get(outcome.given);
  if (!picked) return { verdict: `It’s the marked photo`, tone: 'neutral', detail: country };
  const noun = SUBJECT_NOUNS[picked.subject];
  return {
    verdict: 'Not quite — it’s the marked photo',
    tone: 'wrong',
    detail: `You picked ${label(picked.country.toUpperCase())}’s ${noun}`,
  };
}
