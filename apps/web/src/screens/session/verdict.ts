import { SUBJECT_NOUNS } from '@metabook/core';
import type { Card, SessionItem } from '@metabook/core';
import { label, scopeOf } from '../../app/labels';
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

/**
 * The state name a where card's `explain` ends with ("… (Buenos Aires (B))" → "Buenos Aires (B)"),
 * for when its map is not loaded; undefined when it has none.
 */
export function stateNameFrom(explain: string | undefined): string | undefined {
  const text = explain?.trimEnd() ?? '';
  if (!text.endsWith(')')) return undefined;
  let depth = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === ')') depth++;
    else if (text[i] === '(' && --depth === 0) return text.slice(i + 1, -1).trim() || undefined;
  }
  return undefined;
}

/** A card's answer as shown: a map card whose map is not loaded reads its state from `explain`. */
export function answerLabel(card: Card): string {
  const name = label(card.answer, scopeOf(card));
  return card.map && name === card.answer ? (stateNameFrom(card.explain) ?? name) : name;
}

function baseVerdict(
  card: Card,
  item: Pick<SessionItem, 'mode' | 'contrastPair'>,
  outcome: Outcome,
): Pick<RevealProps, 'verdict' | 'tone' | 'detail'> {
  if (card.type === 'which') return whichVerdict(card, outcome);
  const scope = scopeOf(card);
  const answer = answerLabel(card);
  if (outcome.correct) return { verdict: 'Got it', tone: 'right', detail: answer };
  if (!outcome.given) return { verdict: `It’s ${answer}`, tone: 'neutral' };
  const detail = item.contrastPair
    ? 'Streak reset'
    : item.mode === 'recall' || item.mode === 'map' || card.type === 'areacode'
      ? `You said ${label(outcome.given, scope)}`
      : undefined;
  return { verdict: `Not quite — it’s ${answer}`, tone: 'wrong', detail };
}

/** Which clue cards answer with image ids; the verdict names countries instead. */
function whichVerdict(
  card: Card,
  outcome: Outcome,
): Pick<RevealProps, 'verdict' | 'tone' | 'detail'> {
  const country = label(card.country);
  if (outcome.correct) return { verdict: 'Got it', tone: 'right', detail: country };
  const picked = card.clue?.choices?.find((c) => c.image.id === outcome.given);
  if (!picked) return { verdict: `It’s the marked image`, tone: 'neutral', detail: country };
  const noun = card.subject ? SUBJECT_NOUNS[card.subject] : 'clue';
  return {
    verdict: 'Not quite — it’s the marked image',
    tone: 'wrong',
    detail: `You picked ${label(picked.country)}’s ${noun}`,
  };
}
