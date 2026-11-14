import { SUBJECT_NOUNS } from '@metabook/core';
import { zoneName } from '../../data/areaCodes';
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
  return { ...baseVerdict(card, item, outcome), why: whyFor(card) };
}

/**
 * The card's reason as shown. A where card's `explain` ends with its state in brackets for
 * stateNameFrom; the verdict already names the state, so the bracket is not repeated.
 */
export function whyFor(card: Card): string | undefined {
  const state = card.map ? stateNameFrom(card.explain) : undefined;
  if (!state || !card.explain) return card.explain;
  return card.explain
    .trimEnd()
    .slice(0, -(state.length + 2))
    .trimEnd();
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
  const zone = zoneName(card.country, card.answer);
  if (zone) {
    if (outcome.correct) return { verdict: 'Got it', tone: 'right', detail: zone };
    if (!outcome.given) return { verdict: `It’s ${zone}`, tone: 'neutral' };
    const picked = zoneName(card.country, outcome.given) ?? outcome.given;
    return { verdict: `Not quite — it’s ${zone}`, tone: 'wrong', detail: `You picked ${picked}` };
  }
  const scope = scopeOf(card);
  // a code covering a whole area (France's 04) is answered by the area, named by its key region;
  // one spilling into a single neighbour still names the neighbour ("Mainly …; it also covers …")
  const area = card.type === 'areacode' && (card.spans?.length ?? 0) >= 2;
  // a clue found in several regions: every one of them is right, so name them all
  const several = card.type === 'region' && (card.spans?.length ?? 0) > 0;
  const answer = area
    ? `the area around ${answerLabel(card)}`
    : several
      ? orList([answerLabel(card), ...(card.spans ?? []).map((s) => label(s, scope))])
      : answerLabel(card);
  if (
    outcome.correct &&
    !several &&
    !area &&
    outcome.given !== card.answer &&
    card.spans?.includes(outcome.given)
  ) {
    return {
      verdict: 'Got it',
      tone: 'right',
      detail: `Mainly ${answer}; it also covers ${label(outcome.given, scope)}`,
    };
  }
  if (outcome.correct) {
    return {
      verdict: 'Got it',
      tone: 'right',
      detail: area ? `${answerLabel(card)} and ${card.spans?.length} more` : answer,
    };
  }
  if (!outcome.given) return { verdict: `It’s ${answer}`, tone: 'neutral' };
  const detail = item.contrastPair
    ? 'Streak reset'
    : item.mode === 'recall' || item.mode === 'map' || card.type === 'areacode'
      ? `${area ? 'You picked the area around' : 'You said'} ${label(outcome.given, scope)}`
      : undefined;
  return { verdict: `Not quite — it’s ${answer}`, tone: 'wrong', detail };
}

/** "A", "A or B", "A, B or C" */
function orList(names: string[]): string {
  return names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
}

/** Which clue cards answer with image ids; the verdict names countries instead. */
function whichVerdict(
  card: Card,
  outcome: Outcome,
): Pick<RevealProps, 'verdict' | 'tone' | 'detail'> {
  const country = label(card.country);
  if (outcome.correct) return { verdict: 'Got it', tone: 'right', detail: country };
  const picked = card.clue?.choices?.find((c) => c.image.id === outcome.given);
  const noun = card.subject ? SUBJECT_NOUNS[card.subject] : 'clue';
  // the grid marks the right picture green; the verdict says whose each one is
  if (!picked) {
    return {
      verdict: `It’s ${possessive(country)} ${noun}`,
      tone: 'neutral',
      detail: 'Marked in green',
    };
  }
  return {
    verdict: `Not quite — that’s ${possessive(label(picked.country))} ${noun}`,
    tone: 'wrong',
    detail: `${possessive(country)} is marked in green`,
  };
}

/** "Spain’s", "United States’": a name ending in s takes the apostrophe alone. */
export const possessive = (name: string): string => (/s$/i.test(name) ? `${name}’` : `${name}’s`);
