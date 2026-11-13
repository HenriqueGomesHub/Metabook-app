import {
  activeCountries,
  buildSession,
  intakeFor,
  newCardSeconds,
  reviewSecondsFrom,
  scanCardSeconds,
  isClueCard,
  learnMoreSession,
  mastery,
  parseMapKey,
  practiseMoreSession,
} from '@metabook/core';
import type { Card, CardType, Review, Session, SessionItem } from '@metabook/core';
import type { IconName } from '../components/icons';
import type { AppSnapshot } from './AppData';
import { CARD_TYPES } from './cardTypes';
import { SUBJECTS, tagLabel } from './labels';
import { isMemoriseAreaCode } from '../data/areaCodes';

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

/** What was reviewed today: cards seen before today, and cards first answered today. */
function today(data: AppSnapshot, now: Date) {
  const dayStart = startOfDay(now).getTime();
  const firstReview = new Map<string, number>();
  for (const review of data.reviews) {
    const at = Date.parse(review.reviewedAt);
    if (at < (firstReview.get(review.cardId) ?? Infinity)) firstReview.set(review.cardId, at);
  }
  const reviewedToday = new Set(
    data.reviews.filter((r) => Date.parse(r.reviewedAt) >= dayStart).map((r) => r.cardId),
  );
  const introduced = [...reviewedToday].filter((id) => (firstReview.get(id) ?? 0) >= dayStart);
  // new cards first answered in the last week, and how many of them were right the first time
  const weekAgo = startOfDay(now, -7).getTime();
  const recent = { answered: 0, right: 0 };
  for (const review of data.reviews) {
    const at = Date.parse(review.reviewedAt);
    if (at < weekAgo || at >= dayStart || firstReview.get(review.cardId) !== at) continue;
    recent.answered++;
    if (review.correct) recent.right++;
  }
  // how long this learner's recent reviews took (cards seen before, not first answers)
  const recentMs = data.reviews
    .filter(
      (r) =>
        Date.parse(r.reviewedAt) >= weekAgo &&
        firstReview.get(r.cardId) !== Date.parse(r.reviewedAt),
    )
    .slice(-300)
    .map((r) => r.msTaken);
  return { reviews: reviewedToday.size - introduced.length, introduced, recent, recentMs };
}

/**
 * The cards the daily session draws from: text-only clue cards are for the Clue quiz, and Live
 * view cards for the Street View drill (the keyless embed shows road names).
 */
export const sessionCards = (data: AppSnapshot): Card[] =>
  data.content.cards.filter(
    (card) =>
      !isClueCard(card) &&
      card.type !== 'live' &&
      !isMemoriseAreaCode(card) &&
      (data.settings.regionsInDaily || !isRegional(card)),
  );

/**
 * Cards about a country's inside (which state, which area code, which region): drilled on their
 * own, and in the daily session only when the learner asks for them.
 */
export const isRegional = (card: Card): boolean =>
  Boolean(card.map) || card.type === 'areacode' || card.type === 'region';

/**
 * Today's session, with the daily caps reduced by what was already reviewed and introduced
 * earlier today so repeat sessions don't hand out a fresh batch of new cards.
 */
export function todaySession(data: AppSnapshot, now: Date, type?: CardType): Session {
  const done = today(data, now);
  const cards = sessionCards(data);
  return buildSession({
    cards: type ? cards.filter((card) => card.type === type) : cards,
    states: data.states,
    confusions: data.confusions,
    settings: data.settings,
    doneToday: { reviews: done.reviews, newCards: done.introduced.length },
    introducedToday: done.introduced,
    intake: intakeFor(done.recent, data.settings.returning),
    newSeconds: newCardSeconds(done.recent, data.settings.returning),
    reviewSeconds: reviewSecondsFrom(done.recentMs),
    scanSeconds: scanCardSeconds(done.recent, data.settings.returning),
    // quick refreshes while most new cards are things the learner already knows (85%+ "Knew it"
    // or right first time): a rusty player who recognises on sight. Once a week of answers shows
    // otherwise, new cards are asked again, since answering teaches more than seeing.
    refresh: intakeFor(done.recent, data.settings.returning) === 3,
    now,
  });
}

/** "Learn more": new cards past today's limit, without changing the settings. */
export function learnMore(data: AppSnapshot, now: Date): Session {
  return learnMoreSession({
    cards: sessionCards(data),
    states: data.states,
    settings: data.settings,
    introducedToday: today(data, now).introduced,
  });
}

/** "Practise more": the weakest seen cards, reviewed ahead of time. */
export function practiseMore(data: AppSnapshot, now: Date): Session {
  return practiseMoreSession({ cards: sessionCards(data), states: data.states, now });
}

/** How much is left to learn, and the countries being introduced now. */
export function curriculum(data: AppSnapshot): { newAvailable: number; learningNow: string[] } {
  const cards = sessionCards(data);
  const newAvailable = cards.filter(
    (card) => (data.states[card.id]?.state ?? 'new') === 'new',
  ).length;
  return {
    newAvailable,
    learningNow: activeCountries(cards, data.states, data.settings.focusCountries),
  };
}

/** One line of Today's breakdown: a clue family, or a kind of card not made from clues. */
export interface MixGroup {
  key: string;
  label: string;
  icon: IconName;
  count: number;
}

const TYPE_ICONS: Partial<Record<CardType, IconName>> = {
  flag: 'flag',
  script: 'script',
  lookalike: 'lookalike',
  region: 'region',
  areacode: 'areacode',
  plate: 'plate',
  live: 'streetview',
  meta: 'clue',
};

/** What a queue holds, by family (bollards, poles…) or kind of card, largest first. */
export function sessionMix(items: SessionItem[], cards: Card[]): MixGroup[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const groups = new Map<string, MixGroup>();
  for (const item of items) {
    const card = byId.get(item.cardId);
    if (!card) continue;
    const group: Omit<MixGroup, 'count'> = card.map
      ? { key: 'where', label: 'Where in the country', icon: 'where' }
      : card.clue && card.subject
        ? {
            key: card.subject,
            label: card.subject === 'other' ? 'Other' : SUBJECTS[card.subject].label,
            icon: card.subject,
          }
        : {
            key: card.type,
            label: CARD_TYPES[card.type].label,
            icon: TYPE_ICONS[card.type] ?? 'other',
          };
    const hit = groups.get(group.key);
    groups.set(group.key, { ...group, count: (hit?.count ?? 0) + 1 });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** How far each country's clue cards have been introduced: seen of all its daily-session cards. */
export function countryProgress(
  data: AppSnapshot,
  codes: string[],
): { code: string; seen: number; total: number }[] {
  const cards = sessionCards(data).filter((card) => card.clue);
  return codes.map((code) => {
    const own = cards.filter((card) => card.country === code);
    const seen = own.filter((card) => (data.states[card.id]?.state ?? 'new') !== 'new').length;
    return { code, seen, total: own.length };
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
  const areaCodes = new Set(
    cards.filter((c) => c.type === 'areacode' && c.country === 'BR').map((c) => c.answer),
  );
  return areaCodes.has(picked) && areaCodes.has(truth) ? 'br' : undefined;
}

/** Lower-case codes of the regions maps that map-scoped confusion keys name. */
export function mapsOf(keys: string[]): string[] {
  return [...new Set(keys.flatMap((key) => parseMapKey(key)?.map ?? []))].sort();
}
