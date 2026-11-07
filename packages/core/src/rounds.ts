import { normalizeAnswer } from './answers';
import { pairKey, parsePairKey, recordAnswer } from './confusions';
import { retrievability } from './scheduler';
import type { Card, CardState, Confusion, Review, Round, Snapshot } from './types';

const PULL_FORWARD_MAX = 5;
const TOP_CONFUSIONS = 5;

/** Confusions are keyed by answer string (as drills do): the country's flag-card answer, else its code. */
function nameOf(country: string, flagAnswers: ReadonlyMap<string, string>): string {
  return flagAnswers.get(country) ?? country;
}

function flagAnswersOf(cards: Iterable<Card>): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of cards) if (c.type === 'flag' && !out.has(c.country)) out.set(c.country, c.answer);
  return out;
}

export interface IngestResult {
  confusions: Confusion[];
  states: Record<string, CardState>;
  summary: { rounds: number; misses: number; pulledForward: string[] };
}

/**
 * Country misses upsert a confusion (dated when the round was played) and pull up to 5 of the
 * truth country's weakest seen cards forward to due now.
 */
export function ingestRounds(
  rounds: Round[],
  confusions: Confusion[],
  states: Record<string, CardState>,
  cardsByCountry: Record<string, Card[]>,
  now: Date,
  seenRoundIds: ReadonlySet<string> = new Set(),
): IngestResult {
  const fresh = new Set<string>();
  const ingested = [...rounds]
    .sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt))
    .filter((r) => {
      if (seenRoundIds.has(r.id) || fresh.has(r.id)) return false;
      fresh.add(r.id);
      return true;
    });
  const misses = ingested.filter((r) => r.guess.country !== r.truth.country);
  const names = flagAnswersOf(Object.values(cardsByCountry).flat());
  const nextConfusions = misses.reduce(
    (acc, r) =>
      recordAnswer(
        acc,
        nameOf(r.guess.country, names),
        nameOf(r.truth.country, names),
        false,
        new Date(r.playedAt),
      ),
    confusions,
  );

  const missedCountries = new Set(misses.map((r) => r.truth.country));
  const pulledForward = [...missedCountries].flatMap((country) =>
    (cardsByCountry[country] ?? [])
      .flatMap((card) => {
        const state = states[card.id];
        return state && state.state !== 'new' ? [state] : [];
      })
      .sort((a, b) => retrievability(a, now) - retrievability(b, now))
      .slice(0, PULL_FORWARD_MAX)
      .map((s) => s.cardId),
  );
  const nextStates = { ...states };
  for (const id of pulledForward) {
    nextStates[id] = { ...(states[id] as CardState), due: now.toISOString() };
  }

  return {
    confusions: nextConfusions,
    states: nextStates,
    summary: { rounds: ingested.length, misses: misses.length, pulledForward },
  };
}

const inWindow = (iso: string, since: Date, now: Date) => {
  const t = Date.parse(iso);
  return t >= since.getTime() && t <= now.getTime();
};

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;

/**
 * Per-country accuracy from game rounds, falling back to drill reviews for countries without
 * rounds; confusions are counted from both sources.
 */
export function snapshot(
  rounds: Round[],
  reviews: Review[],
  cards: Card[],
  since: Date,
  now: Date,
): Snapshot {
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const recentRounds = rounds.filter((r) => inWindow(r.playedAt, since, now));
  const recentReviews = reviews.flatMap((r) => {
    const card = cardById.get(r.cardId);
    return card && inWindow(r.reviewedAt, since, now) ? [{ review: r, card }] : [];
  });

  const outcomes = new Map<string, { correct: boolean; km?: number }[]>();
  const push = (country: string, outcome: { correct: boolean; km?: number }) =>
    outcomes.set(country, [...(outcomes.get(country) ?? []), outcome]);
  for (const r of recentRounds) {
    push(r.truth.country, { correct: r.guess.country === r.truth.country, km: r.distanceKm });
  }
  const countriesWithRounds = new Set(outcomes.keys());
  for (const { review, card } of recentReviews) {
    if (!countriesWithRounds.has(card.country)) push(card.country, { correct: review.correct });
  }

  const perCountry: Snapshot['perCountry'] = {};
  for (const [country, list] of outcomes) {
    const avgDistanceKm = mean(list.flatMap((o) => (o.km === undefined ? [] : [o.km])));
    perCountry[country] = {
      accuracy: list.filter((o) => o.correct).length / list.length,
      rounds: list.length,
      ...(avgDistanceKm !== undefined && { avgDistanceKm }),
    };
  }

  const pairCounts = new Map<string, number>();
  const countPair = (picked: string, truth: string) => {
    const key = pairKey({ picked, truth });
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  };
  const names = flagAnswersOf(cards);
  for (const r of recentRounds) {
    if (r.guess.country !== r.truth.country) {
      countPair(nameOf(r.guess.country, names), nameOf(r.truth.country, names));
    }
  }
  const answerByNormalized = new Map(cards.map((c) => [normalizeAnswer(c.answer), c.answer]));
  for (const { review, card } of recentReviews) {
    if (review.correct) continue;
    const given = normalizeAnswer(review.answerGiven);
    countPair(answerByNormalized.get(given) ?? given, card.answer);
  }
  const topConfusions = [...pairCounts]
    .sort(([ka, a], [kb, b]) => b - a || ka.localeCompare(kb))
    .slice(0, TOP_CONFUSIONS)
    .map(([key, count]) => ({ ...parsePairKey(key), count }));

  const avgDistanceKm = mean(
    recentRounds.flatMap((r) => (r.distanceKm === undefined ? [] : [r.distanceKm])),
  );
  return {
    takenAt: now.toISOString(),
    perCountry,
    topConfusions,
    ...(avgDistanceKm !== undefined && { avgDistanceKm }),
  };
}
