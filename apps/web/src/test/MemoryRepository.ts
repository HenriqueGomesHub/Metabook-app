import { DEFAULT_SETTINGS } from '@metabook/core';
import type {
  BlockDay,
  CardState,
  Confusion,
  Review,
  Round,
  Settings,
  TipView,
  TrainingBlock,
} from '@metabook/core';
import type { CardOverride, Repository } from '../data/repository';

const upsert = <T>(items: T[], next: T[], same: (a: T, b: T) => boolean): T[] => [
  ...items.filter((item) => !next.some((n) => same(item, n))),
  ...next,
];

/** In-memory Repository for tests. */
export class MemoryRepository implements Repository {
  settings: Settings = DEFAULT_SETTINGS;
  cardStates: CardState[] = [];
  reviews: Review[] = [];
  confusions: Confusion[] = [];
  tipViews: TipView[] = [];
  rounds: Round[] = [];
  blocks: TrainingBlock[] = [];
  blockDays: BlockDay[] = [];
  overrides: CardOverride[] = [];

  constructor(seed: Partial<Pick<MemoryRepository, 'cardStates' | 'reviews' | 'confusions'>> = {}) {
    Object.assign(this, seed);
  }

  async getSettings() {
    return this.settings;
  }
  async saveSettings(settings: Settings) {
    this.settings = settings;
  }
  async listCardStates() {
    return this.cardStates;
  }
  async upsertCardStates(states: CardState[]) {
    this.cardStates = upsert(this.cardStates, states, (a, b) => a.cardId === b.cardId);
  }
  async addReview(review: Review) {
    this.reviews = [...this.reviews, review];
  }
  async listReviews(since?: string) {
    return this.reviews.filter((r) => since === undefined || r.reviewedAt >= since);
  }
  async listConfusions() {
    return this.confusions;
  }
  async upsertConfusions(confusions: Confusion[]) {
    const same = (a: Confusion, b: Confusion) => a.picked === b.picked && a.truth === b.truth;
    this.confusions = upsert(this.confusions, confusions, same);
  }
  async listTipViews() {
    return this.tipViews;
  }
  async recordTipView(view: TipView) {
    this.tipViews = upsert(this.tipViews, [view], (a, b) => a.tipId === b.tipId);
  }
  async listRounds() {
    return this.rounds;
  }
  async addRounds(rounds: Round[]) {
    this.rounds = upsert(this.rounds, rounds, (a, b) => a.id === b.id);
  }
  async listBlocks() {
    return this.blocks;
  }
  async saveBlock(block: TrainingBlock) {
    this.blocks = upsert(this.blocks, [block], (a, b) => a.id === b.id);
  }
  async listBlockDays(blockId: string) {
    return this.blockDays.filter((d) => d.blockId === blockId);
  }
  async upsertBlockDay(day: BlockDay) {
    const same = (a: BlockDay, b: BlockDay) => a.blockId === b.blockId && a.day === b.day;
    this.blockDays = upsert(this.blockDays, [day], same);
  }
  async listCardOverrides() {
    return this.overrides;
  }
  async saveCardOverride(override: CardOverride) {
    this.overrides = upsert(this.overrides, [override], (a, b) => a.id === b.id);
  }
  async deleteCardOverride(id: string) {
    this.overrides = this.overrides.filter((o) => o.id !== id);
  }
  async getPairing() {
    return null;
  }
  async createPairingCode() {
    return null;
  }
}
