import type {
  BlockDay,
  Card,
  CardState,
  Confusion,
  Review,
  Round,
  Settings,
  Tip,
  TipView,
  TrainingBlock,
} from '@metabook/core';

/** A card or tip edited in the editor; replaces the bundled item with the same id. */
export type CardOverride =
  { id: string; kind: 'card'; data: Card } | { id: string; kind: 'tip'; data: Tip };

export interface Pairing {
  createdAt: string;
  lastUsedAt?: string;
}

export interface Repository {
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;

  listCardStates(): Promise<CardState[]>;
  upsertCardStates(states: CardState[]): Promise<void>;

  addReview(review: Review): Promise<void>;
  /** Reviews with reviewedAt >= since (all when omitted), oldest first. */
  listReviews(since?: string): Promise<Review[]>;

  listConfusions(): Promise<Confusion[]>;
  upsertConfusions(confusions: Confusion[]): Promise<void>;

  listTipViews(): Promise<TipView[]>;
  recordTipView(view: TipView): Promise<void>;

  /** Newest first. */
  listRounds(): Promise<Round[]>;
  /** Existing ids are overwritten. */
  addRounds(rounds: Round[]): Promise<void>;

  listBlocks(): Promise<TrainingBlock[]>;
  saveBlock(block: TrainingBlock): Promise<void>;
  listBlockDays(blockId: string): Promise<BlockDay[]>;
  upsertBlockDay(day: BlockDay): Promise<void>;

  listCardOverrides(): Promise<CardOverride[]>;
  saveCardOverride(override: CardOverride): Promise<void>;
  deleteCardOverride(id: string): Promise<void>;

  /** Cloud only: metadata of the current extension pairing; null when none or in local mode. */
  getPairing(): Promise<Pairing | null>;
  /** Cloud only: replaces any pairing and returns the one-time code; null in local mode. */
  createPairingCode(): Promise<string | null>;
}
