import { retrievability } from './scheduler';
import type { CardState, Medal } from './types';

const THRESHOLDS: { medal: Exclude<Medal, null>; at: number }[] = [
  { medal: 'gold', at: 0.8 },
  { medal: 'silver', at: 0.5 },
  { medal: 'bronze', at: 0.25 },
];

const DAY_MS = 24 * 60 * 60 * 1000;
/** Mastery asks "will you still know it in a week?", so a fresh lapse scores low. */
const HORIZON_MS = 7 * DAY_MS;

/**
 * Recall odds at `at` on the exponential curve FSRS anchors stability to (90% after S days).
 * FSRS-6's own power curve has too long a tail for this: a lapse minutes ago still reads ~58%
 * a week out, and a single Good review reads gold.
 */
function recallAt(state: CardState, at: Date): number {
  if (state.state === 'new') return 0;
  if (!state.lastReview || state.stability <= 0) return retrievability(state, at);
  const days = Math.max(0, at.getTime() - new Date(state.lastReview).getTime()) / DAY_MS;
  return 0.9 ** (days / state.stability);
}

/** Mean recall odds a week from now; cards never seen count 0. */
export function mastery(cardIds: string[], states: Record<string, CardState>, now: Date): number {
  if (cardIds.length === 0) return 0;
  const horizon = new Date(now.getTime() + HORIZON_MS);
  const total = cardIds.reduce((sum, id) => {
    const state = states[id];
    return sum + (state ? recallAt(state, horizon) : 0);
  }, 0);
  return total / cardIds.length;
}

export function medalFor(pct: number): Medal {
  return THRESHOLDS.find((t) => pct >= t.at)?.medal ?? null;
}

/** The next medal up, for hints like "gold at 80%"; null once gold is held. */
export function nextMedal(pct: number): { medal: Exclude<Medal, null>; at: number } | null {
  return THRESHOLDS.findLast((t) => pct < t.at) ?? null;
}
