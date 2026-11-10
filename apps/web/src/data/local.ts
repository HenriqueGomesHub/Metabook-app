import { DEFAULT_SETTINGS } from '@metabook/core';
import type {
  BlockDay,
  CardState,
  ClueImageOverride,
  Confusion,
  Review,
  Round,
  Settings,
  TipView,
  TrainingBlock,
} from '@metabook/core';
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase, StoreNames, StoreValue } from 'idb';
import type { CardOverride, Pairing, Repository, SavedSpot } from './repository';

interface MetabookDB extends DBSchema {
  settings: { key: string; value: Settings };
  cardStates: { key: string; value: CardState };
  reviews: { key: string; value: Review; indexes: { reviewedAt: string } };
  confusions: { key: [string, string]; value: Confusion };
  tipViews: { key: string; value: TipView };
  rounds: { key: string; value: Round };
  blocks: { key: string; value: TrainingBlock };
  blockDays: { key: [string, string]; value: BlockDay; indexes: { blockId: string } };
  cardOverrides: { key: string; value: CardOverride };
  savedSpots: { key: string; value: SavedSpot & { id: string; createdAt: string } };
}

const SETTINGS_KEY = 'main';

export class LocalRepository implements Repository {
  private readonly db: Promise<IDBPDatabase<MetabookDB>>;

  constructor(name = 'metabook') {
    this.db = openDB<MetabookDB>(name, 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('settings');
          db.createObjectStore('cardStates', { keyPath: 'cardId' });
          db.createObjectStore('reviews', { keyPath: 'id' }).createIndex(
            'reviewedAt',
            'reviewedAt',
          );
          db.createObjectStore('confusions', { keyPath: ['picked', 'truth'] });
          db.createObjectStore('tipViews', { keyPath: 'tipId' });
          db.createObjectStore('rounds', { keyPath: 'id' });
          db.createObjectStore('blocks', { keyPath: 'id' });
          db.createObjectStore('blockDays', { keyPath: ['blockId', 'day'] }).createIndex(
            'blockId',
            'blockId',
          );
          db.createObjectStore('cardOverrides', { keyPath: 'id' });
        }
        if (oldVersion < 2) db.createObjectStore('savedSpots', { keyPath: 'id' });
      },
    });
  }

  async getSettings(): Promise<Settings> {
    const stored = await (await this.db).get('settings', SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async saveSettings(settings: Settings): Promise<void> {
    await (await this.db).put('settings', settings, SETTINGS_KEY);
  }

  async listCardStates(): Promise<CardState[]> {
    return (await this.db).getAll('cardStates');
  }

  async upsertCardStates(states: CardState[]): Promise<void> {
    await this.putAll('cardStates', states);
  }

  async addReview(review: Review): Promise<void> {
    await (await this.db).put('reviews', review);
  }

  async listReviews(since?: string): Promise<Review[]> {
    const range = since === undefined ? undefined : IDBKeyRange.lowerBound(since);
    return (await this.db).getAllFromIndex('reviews', 'reviewedAt', range);
  }

  async listConfusions(): Promise<Confusion[]> {
    return (await this.db).getAll('confusions');
  }

  async upsertConfusions(confusions: Confusion[]): Promise<void> {
    await this.putAll('confusions', confusions);
  }

  async listTipViews(): Promise<TipView[]> {
    return (await this.db).getAll('tipViews');
  }

  async recordTipView(view: TipView): Promise<void> {
    await (await this.db).put('tipViews', view);
  }

  async listRounds(): Promise<Round[]> {
    const rounds = await (await this.db).getAll('rounds');
    return rounds.sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  }

  async addRounds(rounds: Round[]): Promise<void> {
    await this.putAll('rounds', rounds);
  }

  async listBlocks(): Promise<TrainingBlock[]> {
    const blocks = await (await this.db).getAll('blocks');
    return blocks.sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  }

  async saveBlock(block: TrainingBlock): Promise<void> {
    await (await this.db).put('blocks', block);
  }

  async listBlockDays(blockId: string): Promise<BlockDay[]> {
    return (await this.db).getAllFromIndex('blockDays', 'blockId', blockId);
  }

  async upsertBlockDay(day: BlockDay): Promise<void> {
    await (await this.db).put('blockDays', day);
  }

  async listCardOverrides(): Promise<CardOverride[]> {
    return (await this.db).getAll('cardOverrides');
  }

  async saveCardOverride(override: CardOverride): Promise<void> {
    await (await this.db).put('cardOverrides', override);
  }

  async deleteCardOverride(id: string): Promise<void> {
    await (await this.db).delete('cardOverrides', id);
  }

  /** Image corrections are made in /curate, which needs cloud mode. */
  async listClueImageOverrides(): Promise<ClueImageOverride[]> {
    return [];
  }

  /** No private bucket in local mode: images use their original URLs. */
  async signClueImages(): Promise<Record<string, string>> {
    return {};
  }

  async saveSpot(spot: SavedSpot): Promise<void> {
    const id = crypto.randomUUID();
    await (await this.db).put('savedSpots', { ...spot, id, createdAt: new Date().toISOString() });
  }

  async getPairing(): Promise<Pairing | null> {
    return null;
  }

  async createPairingCode(): Promise<string | null> {
    return null;
  }

  private async putAll<S extends StoreNames<MetabookDB>>(
    store: S,
    items: StoreValue<MetabookDB, S>[],
  ): Promise<void> {
    const tx = (await this.db).transaction(store, 'readwrite');
    await Promise.all([...items.map((item) => tx.store.put(item)), tx.done]);
  }
}
