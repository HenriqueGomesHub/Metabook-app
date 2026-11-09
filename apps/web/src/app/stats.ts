import { buildSession, mastery, parseMapKey } from '@metabook/core';
import type { Card, CardType, Review, Session } from '@metabook/core';
import type { AppSnapshot } from './AppData';
import { tagLabel } from './labels';

const FALLBACK_MEDIAN_MS = 6000;
const STREAK_DAYS = 14;

export function medianMs(reviews: Review[], cards: Card[], type: CardType): number {
  const ofType = new Set(cards.filter((card) => card.type === type).map((card) => card.id));
  const times = reviews
    .filter((review) => ofType.has(review.cardId))
    .map((review) => review.msTaken)
    .sort((a, b) => a - b);
  if (times.length === 0) return FALLBACK_MEDIAN_MS;
  const mid = times.length / 2;
  return Number.isInteger(mid)
    ? ((times[mid - 1] as number) + (times[mid] as number)) / 2
    : (times[Math.floor(mid)] as number);
}

function startOfDay(date: Date, offsetDays = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays);
}

/**
 * Today's session, with the daily caps reduced by what was already reviewed and introduced
 * earlier today so repeat sessions don't hand out a fresh batch of new cards.
 */
export function todaySession(data: AppSnapshot, now: Date, type?: CardType): Session {
  const dayStart = startOfDay(now).getTime();
  const firstReview = new Map<string, number>();
  for (const review of data.reviews) {
    if (!firstReview.has(review.cardId))
      firstReview.set(review.cardId, Date.parse(review.reviewedAt));
  }
  const reviewedToday = new Set(
    data.reviews.filter((r) => Date.parse(r.reviewedAt) >= dayStart).map((r) => r.cardId),
  );
  const introduced = [...reviewedToday].filter((id) => (firstReview.get(id) ?? 0) >= dayStart);
  return buildSession({
    cards: type ? data.content.cards.filter((card) => card.type === type) : data.content.cards,
    states: data.states,
    confusions: data.confusions,
    settings: data.settings,
    doneToday: { reviews: reviewedToday.size - introduced.length, newCards: introduced.length },
    now,
  });
}

/** For each of the last 14 local days (oldest first), whether any review happened. */
export function practisedDays(reviews: Review[], now: Date): boolean[] {
  const days = new Set(reviews.map((review) => startOfDay(new Date(review.reviewedAt)).getTime()));
  return Array.from({ length: STREAK_DAYS }, (_, i) =>
    days.has(startOfDay(now, i - STREAK_DAYS + 1).getTime()),
  );
}

/** Consecutive practised days ending today, or yesterday when today is not done yet. */
export function streakLength(days: boolean[]): number {
  const run = days.at(-1) ? days : days.slice(0, -1);
  const lastMiss = run.lastIndexOf(false);
  return run.length - 1 - lastMiss;
}

/** The tag or chapter with the lowest mastery among those already practised. */
export function weakestGroup(data: AppSnapshot, now: Date): string | null {
  const groups = new Map<string, string[]>();
  const add = (key: string, id: string) => groups.set(key, [...(groups.get(key) ?? []), id]);
  for (const card of data.content.cards) {
    for (const tag of card.tags) add(tag, card.id);
    if (card.chapter) add(card.chapter, card.id);
  }
  let weakest: { key: string; score: number } | null = null;
  for (const [key, ids] of groups) {
    if (!ids.some((id) => data.states[id] && data.states[id].state !== 'new')) continue;
    const score = mastery(ids, data.states, now);
    if (!weakest || score < weakest.score) weakest = { key, score };
  }
  if (!weakest) return null;
  const key = weakest.key;
  return data.content.chapters.find((chapter) => chapter.id === key)?.title ?? tagLabel(key);
}

/**
 * Scope for labelling a confusion pair: `'br'` when both sides are answers of area-code cards, so
 * "SP|MG" reads São Paulo / Minas Gerais rather than Madagascar; the map's code when both sides
 * are map-scoped keys of one regions map ("ca:PE|ca:NL"), so callers know which map to load.
 */
export function pairScope(cards: Card[], picked: string, truth: string): string | undefined {
  const [a, b] = [parseMapKey(picked), parseMapKey(truth)];
  if (a && b && a.map === b.map) return a.map;
  const areaCodes = new Set(cards.filter((c) => c.type === 'areacode').map((c) => c.answer));
  return areaCodes.has(picked) && areaCodes.has(truth) ? 'br' : undefined;
}

/** Lower-case codes of the regions maps that map-scoped confusion keys name. */
export function mapsOf(keys: string[]): string[] {
  return [...new Set(keys.flatMap((key) => parseMapKey(key)?.map ?? []))].sort();
}
