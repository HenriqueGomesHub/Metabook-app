import { pairKey, parsePairKey } from './confusions';
import type { BlockDay, BlockTarget, Card, Settings, Snapshot, TrainingBlock } from './types';

const DAYS_RANGE = [7, 30] as const;
const MINUTES_RANGE = [10, 60] as const;
const WEAK_COUNTRIES = 3;
const WEAK_PAIRS = 2;
const MIN_DATA_POINTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (value: number, [min, max]: readonly [number, number]) =>
  Math.min(max, Math.max(min, value));

/** YYYY-MM-DD in local time. */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDay(day: string): Date {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(day: string, days: number): string {
  const date = parseDay(day);
  date.setDate(date.getDate() + days);
  return localDay(date);
}

const daysBetween = (from: string, to: string) =>
  Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / DAY_MS);

export function matchesTarget(card: Card, target: BlockTarget): boolean {
  switch (target.kind) {
    case 'country':
      return card.country === target.key;
    case 'chapter':
      return card.chapter === target.key;
    case 'pair': {
      const { picked, truth } = parsePairKey(target.key);
      return [picked, truth].some((key) => key === card.country || key === card.answer);
    }
  }
}

export function planBlock(input: {
  snapshot: Snapshot;
  settings: Settings;
  now: Date;
  days?: number;
  minutes?: number;
}): TrainingBlock {
  const { snapshot, settings, now } = input;
  const startsOn = localDay(now);
  const days = clamp(input.days ?? settings.blockDays, DAYS_RANGE);

  const weakCountries: BlockTarget[] = Object.entries(snapshot.perCountry)
    .filter(([, stats]) => stats.rounds >= MIN_DATA_POINTS)
    .sort(
      ([a, sa], [b, sb]) =>
        sa.accuracy - sb.accuracy || sb.rounds - sa.rounds || a.localeCompare(b),
    )
    .slice(0, WEAK_COUNTRIES)
    .map(([key]) => ({ kind: 'country', key }));
  const weakPairs: BlockTarget[] = snapshot.topConfusions
    .slice(0, WEAK_PAIRS)
    .map((pair) => ({ kind: 'pair', key: pairKey(pair) }));

  return {
    id: `block-${now.getTime()}`,
    startsOn,
    endsOn: addDays(startsOn, days - 1),
    minutesPerDay: clamp(input.minutes ?? settings.blockMinutes, MINUTES_RANGE),
    targets: [...weakCountries, ...weakPairs],
    baseline: snapshot,
    status: 'active',
  };
}

export interface BlockProgress {
  /** 0-based day of the block, clamped to its length */
  dayIndex: number;
  totalDays: number;
  todayMinutes: number;
  missedDays: number;
  finished: boolean;
}

export function blockProgress(
  block: TrainingBlock,
  blockDays: BlockDay[],
  now: Date,
): BlockProgress {
  const today = localDay(now);
  const totalDays = daysBetween(block.startsOn, block.endsOn) + 1;
  const elapsed = daysBetween(block.startsOn, today);
  const practised = new Set(
    blockDays
      .filter((d) => d.blockId === block.id && (d.minutesDone > 0 || d.cardsDone > 0))
      .map((d) => d.day),
  );
  const pastDays = Array.from({ length: clamp(elapsed, [0, totalDays]) }, (_, i) =>
    addDays(block.startsOn, i),
  );
  return {
    dayIndex: clamp(elapsed, [0, totalDays - 1]),
    totalDays,
    todayMinutes:
      blockDays.find((d) => d.blockId === block.id && d.day === today)?.minutesDone ?? 0,
    missedDays: pastDays.filter((day) => !practised.has(day)).length,
    finished: block.status !== 'active' || elapsed >= totalDays,
  };
}

export interface TargetDelta {
  target: BlockTarget;
  /** accuracy for countries, miss count for pairs; null when the snapshot has no data */
  before: number | null;
  after: number | null;
  delta: number | null;
}

function targetValue(target: BlockTarget, snap: Snapshot): number | null {
  if (target.kind === 'country') return snap.perCountry[target.key]?.accuracy ?? null;
  if (target.kind === 'pair') {
    return snap.topConfusions.find((c) => pairKey(c) === target.key)?.count ?? null;
  }
  return null;
}

export function compareBlocks(
  targets: BlockTarget[],
  baseline: Snapshot,
  final: Snapshot,
): TargetDelta[] {
  return targets.map((target) => {
    const before = targetValue(target, baseline);
    const after =
      target.kind === 'pair' ? (targetValue(target, final) ?? 0) : targetValue(target, final);
    return {
      target,
      before,
      after,
      delta: before !== null && after !== null ? after - before : null,
    };
  });
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countryName = (key: string) => (/^[A-Z]{2}$/.test(key) ? (regionNames.of(key) ?? key) : key);

export function suggestMaps(targets: BlockTarget[]): string[] {
  return targets.flatMap((target) => {
    if (target.kind === 'country') return [`Play a map focused on ${countryName(target.key)}`];
    if (target.kind === 'pair') {
      const { picked, truth } = parsePairKey(target.key);
      return [`Play a map focused on ${countryName(truth)} and ${countryName(picked)}`];
    }
    return [];
  });
}
