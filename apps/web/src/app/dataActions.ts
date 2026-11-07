import { blockProgress, ingestRounds, snapshot } from '@metabook/core';
import type { BlockDay, Card, CardState, Confusion, Round, TrainingBlock } from '@metabook/core';
import type { Repository } from '../data/repository';
import type { AppSnapshot } from './AppData';

/** A new snapshot plus the repository writes that make it durable. */
export interface Change {
  data: AppSnapshot;
  save(repo: Repository): Promise<unknown>[];
}

export interface IngestSummary {
  rounds: number;
  misses: number;
  pulledForward: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const BASELINE_DAYS = 30;

/** YYYY-MM-DD in local time. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function activeBlock(data: AppSnapshot): TrainingBlock | undefined {
  return data.blocks.find((block) => block.status === 'active');
}

/** Game rounds and drill reviews of the last 30 days, the baseline for planning a block. */
export function currentSnapshot(data: AppSnapshot, now: Date) {
  return snapshot(
    data.rounds,
    data.reviews,
    data.content.cards,
    new Date(now.getTime() - BASELINE_DAYS * DAY_MS),
    now,
  );
}

export function logRoundsChange(
  data: AppSnapshot,
  rounds: Round[],
  now: Date,
): Change & { summary: IngestSummary } {
  const seen = new Set(data.rounds.map((round) => round.id));
  const fresh = rounds.filter((round) => !seen.has(round.id));
  const cardsByCountry: Record<string, Card[]> = {};
  for (const card of data.content.cards) {
    (cardsByCountry[card.country] ??= []).push(card);
  }
  const result = ingestRounds(fresh, data.confusions, data.states, cardsByCountry, now, seen);
  const changedConfusions: Confusion[] = result.confusions.filter(
    (confusion) => !data.confusions.includes(confusion),
  );
  const changedStates: CardState[] = result.summary.pulledForward.map(
    (id) => result.states[id] as CardState,
  );
  return {
    data: {
      ...data,
      rounds: [...fresh, ...data.rounds].sort((a, b) => b.playedAt.localeCompare(a.playedAt)),
      confusions: result.confusions,
      states: result.states,
    },
    save: (repo) => [
      repo.addRounds(fresh),
      repo.upsertConfusions(changedConfusions),
      repo.upsertCardStates(changedStates),
    ],
    summary: {
      rounds: result.summary.rounds,
      misses: result.summary.misses,
      pulledForward: changedStates.length,
    },
  };
}

export function startBlockChange(data: AppSnapshot, block: TrainingBlock): Change {
  return {
    data: { ...data, blocks: [block, ...data.blocks] },
    save: (repo) => [repo.saveBlock(block)],
  };
}

/** Closes a block with a final snapshot taken over the days it ran. */
export function finishBlockChange(
  data: AppSnapshot,
  blockId: string,
  status: 'finished' | 'ended-early',
  now: Date,
): Change {
  const block = data.blocks.find((b) => b.id === blockId);
  if (!block) return { data, save: () => [] };
  const [y = 0, m = 1, d = 1] = block.startsOn.split('-').map(Number);
  const done: TrainingBlock = {
    ...block,
    status,
    final: snapshot(data.rounds, data.reviews, data.content.cards, new Date(y, m - 1, d), now),
  };
  return {
    data: { ...data, blocks: data.blocks.map((b) => (b.id === blockId ? done : b)) },
    save: (repo) => [repo.saveBlock(done)],
  };
}

/** Adds the time and card of one answer to today's day of the active block, if there is one. */
export function blockStudyChange(data: AppSnapshot, msTaken: number, now: Date): Change | null {
  const block = activeBlock(data);
  if (!block || blockProgress(block, data.blockDays, now).finished) return null;
  const day = localDay(now);
  const before = data.blockDays.find((d) => d.blockId === block.id && d.day === day);
  const next: BlockDay = {
    blockId: block.id,
    day,
    cardsDone: (before?.cardsDone ?? 0) + 1,
    // exact minutes: rounding each answer would drop every quick one to 0
    minutesDone: (before?.minutesDone ?? 0) + msTaken / 60000,
  };
  return {
    data: {
      ...data,
      blockDays: [...data.blockDays.filter((d) => d !== before), next],
    },
    save: (repo) => [repo.upsertBlockDay(next)],
  };
}
