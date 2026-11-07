import { retrievability } from './scheduler';
import type { CardState, Medal } from './types';

const THRESHOLDS: { medal: Exclude<Medal, null>; at: number }[] = [
  { medal: 'gold', at: 0.8 },
  { medal: 'silver', at: 0.5 },
  { medal: 'bronze', at: 0.25 },
];

/** Mean retrievability now; cards never seen count 0. */
export function mastery(cardIds: string[], states: Record<string, CardState>, now: Date): number {
  if (cardIds.length === 0) return 0;
  const total = cardIds.reduce((sum, id) => {
    const state = states[id];
    return sum + (state ? retrievability(state, now) : 0);
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
