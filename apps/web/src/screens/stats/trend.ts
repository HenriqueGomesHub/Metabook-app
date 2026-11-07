import type { Review } from '@metabook/core';

export const TREND_DAYS = 30;
const DAY_MS = 86_400_000;

export interface TrendPoint {
  /** 0 is 29 days ago, 29 is today */
  day: number;
  /** share of reviews answered correctly, 0–100 */
  value: number;
}

const startOfDay = (date: Date, offset = 0) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);

/** Daily % correct over the last 30 local days; days without reviews are left out. */
export function dailyAccuracy(reviews: Review[], now: Date): TrendPoint[] {
  const first = startOfDay(now, 1 - TREND_DAYS).getTime();
  const tally = Array.from({ length: TREND_DAYS }, () => ({ right: 0, all: 0 }));
  for (const review of reviews) {
    const day = Math.floor(
      (startOfDay(new Date(review.reviewedAt)).getTime() - first + DAY_MS / 2) / DAY_MS,
    );
    const slot = tally[day];
    if (!slot) continue;
    slot.all += 1;
    if (review.correct) slot.right += 1;
  }
  return tally.flatMap((slot, day) =>
    slot.all > 0 ? [{ day, value: (slot.right / slot.all) * 100 }] : [],
  );
}

export interface Axis {
  lo: number;
  hi: number;
  ticks: number[];
}

/** A 10-point-aligned range around the data, at least 20 points tall, with a tick per 10. */
export function niceAxis(values: number[]): Axis {
  const min = Math.min(...values);
  const max = Math.max(...values);
  let lo = Math.max(0, Math.floor((min - 2) / 10) * 10);
  let hi = Math.min(100, Math.ceil((max + 2) / 10) * 10);
  if (hi - lo < 20) {
    if (lo >= 10) lo -= 10;
    else hi = Math.min(100, lo + 20);
  }
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 10) ticks.push(t);
  return { lo, hi, ticks };
}
