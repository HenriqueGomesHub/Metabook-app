import type { Tip, TipView } from './types';

export interface PickedTip {
  tip: Tip;
  index: number;
  total: number;
}

/**
 * Least-recently-seen tip for an answer (never-seen first, ties by id). `skip` steps through the
 * rotation for "Another tip" and wraps around.
 */
export function pickTip(
  tips: Tip[],
  answer: string,
  scope: string,
  views: TipView[],
  skip = 0,
): PickedTip | null {
  const lastShown = new Map(views.map((v) => [v.tipId, v.lastShown]));
  const candidates = tips
    .filter((t) => t.answer === answer && (t.scope === scope || t.scope === 'any'))
    .sort(
      (a, b) =>
        (lastShown.get(a.id) ?? '').localeCompare(lastShown.get(b.id) ?? '') ||
        a.id.localeCompare(b.id),
    );
  const index = skip % candidates.length;
  const tip = candidates[index];
  return tip ? { tip, index, total: candidates.length } : null;
}
