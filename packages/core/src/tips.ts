import type { Card, Tip, TipView } from './types';

export interface PickedTip {
  tip: Tip;
  index: number;
  total: number;
}

/** Words too common to say whether a tip is about what the card shows. */
const STOP = new Set(
  'the and for with that this from are but not has have its it is in on of to a an or as at by be you your can than more most only also same other one two all any look looks like used use seen see'.split(
    ' ',
  ),
);

function words(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const word = raw.length > 4 && raw.endsWith('s') ? raw.slice(0, -1) : raw;
    if (word.length >= 3 && !STOP.has(word)) out.add(word);
  }
  return out;
}

/** Letters a tip names on their own ("і, ї, є and ґ", "ß"): a card showing one is about it. */
const namedLetters = (text: string) =>
  (text.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? []).filter((w) => /^[^a-z]{1,2}$/.test(w));

/** What a card shows in words: its text, image description and its own reason. */
export function cardContext(card: Card): string {
  return [card.prompt.kind === 'text' ? card.prompt.value : '', card.prompt.alt, card.explain]
    .filter(Boolean)
    .join(' ');
}

/** How much of a tip is about the given text: shared words, and letters it names that the text has. */
export function tipRelevance(tip: Tip, context: string): number {
  if (!context) return 0;
  const have = words(context);
  let score = 0;
  for (const word of words(tip.text)) if (have.has(word)) score += 2;
  const shown = context.toLowerCase();
  for (const letter of namedLetters(tip.text)) if (shown.includes(letter)) score += 1;
  return score;
}

/**
 * Every tip for an answer in the order to show them: the ones about what the card shows first
 * (`context`, see cardContext), then preferred ones, then least recently seen, ties by id.
 */
export function rankTips(
  tips: Tip[],
  answer: string,
  scope: string,
  views: TipView[],
  context = '',
  prefer?: (tip: Tip) => boolean,
): Tip[] {
  const lastShown = new Map(views.map((v) => [v.tipId, v.lastShown]));
  const relevance = new Map(tips.map((t) => [t.id, tipRelevance(t, context)]));
  const rank = (t: Tip) => (prefer?.(t) ? 0 : 1);
  return tips
    .filter((t) => t.answer === answer && (t.scope === scope || t.scope === 'any'))
    .sort(
      (a, b) =>
        (relevance.get(b.id) ?? 0) - (relevance.get(a.id) ?? 0) ||
        rank(a) - rank(b) ||
        (lastShown.get(a.id) ?? '').localeCompare(lastShown.get(b.id) ?? '') ||
        a.id.localeCompare(b.id),
    );
}

/**
 * Least-recently-seen tip for an answer (never-seen first, ties by id). `index` is the tip's
 * stable position when the tips are sorted by id. `skip` steps through the
 * rotation for "Another tip" and wraps around. Tips matching `prefer` come first.
 */
export function pickTip(
  tips: Tip[],
  answer: string,
  scope: string,
  views: TipView[],
  skip = 0,
  prefer?: (tip: Tip) => boolean,
): PickedTip | null {
  const candidates = rankTips(tips, answer, scope, views, '', prefer);
  const tip = candidates[skip % candidates.length];
  if (!tip) return null;
  const stable = candidates.map((t) => t.id).sort((a, b) => a.localeCompare(b));
  return { tip, index: stable.indexOf(tip.id), total: candidates.length };
}
