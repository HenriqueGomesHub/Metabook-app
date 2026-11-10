import { DEFAULT_SETTINGS } from '@metabook/core';
import type {
  BlockDay,
  CardState,
  ClueImageOverride,
  CropBox,
  Confusion,
  Review,
  Round,
  Settings,
  TipView,
  TrainingBlock,
} from '@metabook/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CardOverride, Pairing, Repository, SavedSpot } from './repository';

type Row = Record<string, unknown>;

const PAGE = 1000;
/** signed clue image URLs live an hour; the app re-signs after 50 minutes */
const SIGNED_SECONDS = 3600;

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function mapKeys(source: object, rename: (key: string) => string, dropNull: boolean): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(source)) {
    if (!(dropNull && value === null)) out[rename(key)] = value;
  }
  return out;
}

const toRow = (item: object): Row => mapKeys(item, toSnake, false);
const TIMESTAMPS = new Set([
  'due',
  'lastReview',
  'reviewedAt',
  'lastSeen',
  'lastShown',
  'playedAt',
  'createdAt',
  'lastUsedAt',
]);

function fromRow<T>(row: Row): T {
  const out = mapKeys(row, toCamel, true);
  delete out.userId;
  for (const key of TIMESTAMPS) {
    const value = out[key];
    if (typeof value === 'string') out[key] = new Date(value).toISOString();
  }
  return out as T;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export class SupabaseRepository implements Repository {
  constructor(private readonly client: SupabaseClient) {}

  async getSettings(): Promise<Settings> {
    const { data, error } = await this.client.from('settings').select('data').maybeSingle();
    check(error);
    return { ...DEFAULT_SETTINGS, ...(data?.data as Partial<Settings> | undefined) };
  }

  async saveSettings(settings: Settings): Promise<void> {
    const { error } = await this.client
      .from('settings')
      .upsert({ data: settings }, { onConflict: 'user_id' });
    check(error);
  }

  async listCardStates(): Promise<CardState[]> {
    return (await this.selectAll('card_state', 'card_id')).map(fromRow<CardState>);
  }

  async upsertCardStates(states: CardState[]): Promise<void> {
    await this.upsert('card_state', states, 'user_id,card_id');
  }

  async addReview(review: Review): Promise<void> {
    await this.upsert('reviews', [review], 'user_id,id');
  }

  async listReviews(since?: string): Promise<Review[]> {
    return (await this.selectAll('reviews', 'reviewed_at', since)).map(fromRow<Review>);
  }

  async listConfusions(): Promise<Confusion[]> {
    return (await this.selectAll('confusions', 'picked,truth')).map(fromRow<Confusion>);
  }

  async upsertConfusions(confusions: Confusion[]): Promise<void> {
    await this.upsert('confusions', confusions, 'user_id,picked,truth');
  }

  async listTipViews(): Promise<TipView[]> {
    return (await this.selectAll('tip_views', 'tip_id')).map(fromRow<TipView>);
  }

  async recordTipView(view: TipView): Promise<void> {
    await this.upsert('tip_views', [view], 'user_id,tip_id');
  }

  async listRounds(): Promise<Round[]> {
    return (await this.selectAll('rounds', 'played_at', undefined, false)).map(fromRow<Round>);
  }

  async addRounds(rounds: Round[]): Promise<void> {
    await this.upsert('rounds', rounds, 'user_id,id');
  }

  async listBlocks(): Promise<TrainingBlock[]> {
    return (await this.selectAll('training_blocks', 'starts_on')).map(fromRow<TrainingBlock>);
  }

  async saveBlock(block: TrainingBlock): Promise<void> {
    await this.upsert('training_blocks', [block], 'user_id,id');
  }

  async listBlockDays(blockId: string): Promise<BlockDay[]> {
    const { data, error } = await this.client
      .from('block_days')
      .select('*')
      .eq('block_id', blockId)
      .order('day');
    check(error);
    return (data ?? []).map(fromRow<BlockDay>);
  }

  async upsertBlockDay(day: BlockDay): Promise<void> {
    await this.upsert('block_days', [day], 'user_id,block_id,day');
  }

  async listCardOverrides(): Promise<CardOverride[]> {
    return (await this.selectAll('card_overrides', 'id')).map(fromRow<CardOverride>);
  }

  async saveCardOverride(override: CardOverride): Promise<void> {
    await this.upsert('card_overrides', [override], 'user_id,id');
  }

  async deleteCardOverride(id: string): Promise<void> {
    const { error } = await this.client.from('card_overrides').delete().eq('id', id);
    check(error);
  }

  async listClueImageOverrides(): Promise<ClueImageOverride[]> {
    try {
      const rows = await this.selectAll('clue_image_overrides', 'image_id');
      return rows.map((row) => ({
        imageId: String(row.image_id),
        clueId: String(row.clue_id),
        crop: (row.crop as CropBox | null) ?? null,
        hidden: row.hidden === true,
      }));
    } catch {
      // the table arrives with migration 0006; until then there are no overrides
      return [];
    }
  }

  async signClueImages(paths: string[]): Promise<Record<string, string>> {
    if (paths.length === 0) return {};
    try {
      const { data, error } = await this.client.storage
        .from('clues')
        .createSignedUrls(paths, SIGNED_SECONDS);
      if (error || !data) return {};
      return Object.fromEntries(
        data.flatMap((item) =>
          item.path && item.signedUrl && !item.error ? [[item.path, item.signedUrl]] : [],
        ),
      );
    } catch {
      return {};
    }
  }

  async saveSpot(spot: SavedSpot): Promise<void> {
    const { error } = await this.client.from('saved_spots').insert(toRow(spot));
    check(error);
  }

  async getPairing(): Promise<Pairing | null> {
    const { data, error } = await this.client
      .from('extension_tokens')
      .select('created_at,last_used_at')
      .maybeSingle();
    check(error);
    return data ? fromRow<Pairing>(data) : null;
  }

  async createPairingCode(): Promise<string> {
    const { data, error } = await this.client.rpc('create_pairing_code');
    check(error);
    return data as string;
  }

  private async upsert(table: string, items: object[], onConflict: string): Promise<void> {
    if (items.length === 0) return;
    const { error } = await this.client.from(table).upsert(items.map(toRow), { onConflict });
    check(error);
  }

  /** Pages through a table in `order` (ascending by default); `since` filters the order column. */
  private async selectAll(
    table: string,
    order: string,
    since?: string,
    ascending = true,
  ): Promise<Row[]> {
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = this.client.from(table).select('*');
      if (since !== undefined) query = query.gte(order, since);
      for (const column of order.split(',')) query = query.order(column, { ascending });
      const { data, error } = await query.range(from, from + PAGE - 1);
      check(error);
      const page = data ?? [];
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }
}
