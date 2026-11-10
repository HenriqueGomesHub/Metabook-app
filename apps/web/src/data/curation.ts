import type { MetaSubject } from '@metabook/core';
import type { SupabaseClient } from '@supabase/supabase-js';

/** A pending photo in the media_candidates queue (supabase/migrations/0003_media.sql). */
export interface Candidate {
  id: string;
  /** lower-case ISO code */
  country: string;
  subject: MetaSubject;
  source: 'commons' | 'mapillary';
  sourceUrl: string;
  /** path in the `media` bucket, e.g. "candidates/3f2a9c1b7d40.webp" */
  storagePath: string;
  preview: string | null;
  credit: string;
  licence: string;
  title: string | null;
  /** curator-only context (Commons description); read-only, may name the country */
  description: string | null;
  caption: string | null;
  giveaways: string[];
  /** pixel size of the candidate file, when the pipeline recorded it */
  width: number | null;
  height: number | null;
  /** the part of the photo to keep, set while curating (0004_crop.sql); null keeps it whole */
  crop: Crop | null;
}

/** A crop as fractions 0..1 of the original image: left, top, width, height. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * An agent-suggested use of a candidate photo (media_uses, 0005_media_uses.sql): a crop tagged
 * with the subject it teaches. Approved uses become MediaItems of their own.
 */
export interface Use {
  id: string;
  candidateId: string;
  subject: MetaSubject;
  crop: Crop;
  /** the agent's note, the caption-to-be */
  note: string | null;
  /** from the candidate */
  country: string;
  storagePath: string;
  width: number | null;
  height: number | null;
  preview: string | null;
  credit: string;
  sourceUrl: string;
  title: string | null;
  description: string | null;
}

export type UseStatus = 'suggested' | 'approved' | 'rejected';

export interface Decision {
  status: 'pending' | 'approved' | 'rejected';
  subject: MetaSubject;
  giveaways: string[];
  caption: string | null;
  /** written only when present: a crop, or null to clear one; left out, the row keeps its crop */
  crop?: Crop | null;
}

/** Admin-only access to the photo queue; RLS enforces it on the server. */
export interface CurationApi {
  /** true when the signed-in user has a row in app_admins */
  isAdmin(): Promise<boolean>;
  /** pending candidates, oldest first */
  listPending(): Promise<Candidate[]>;
  /**
   * Writes a decision; back to 'pending' (undo) clears decided_at, and throws AlreadyCollected for
   * a row the collect job has already turned into cards (collected_at set).
   */
  decide(id: string, decision: Decision): Promise<void>;
  /**
   * Sets one status on many rows in a single request (an `in` filter). Writes only status and
   * decided_at, so each row keeps its own subject, giveaways and caption; no-op for no ids.
   * Back to 'pending' skips collected rows and also clears their crop. Returns the ids it changed.
   */
  decideMany(ids: string[], status: Decision['status']): Promise<string[]>;
  /** Saves only the crop of one uncollected row (the grid approves it later with decideMany). */
  setCrop(id: string, crop: Crop | null): Promise<void>;
  /** subject → number of suggested uses; throws UsesUnavailable before 0005_media_uses.sql */
  countUses(): Promise<Partial<Record<MetaSubject, number>>>;
  /** every suggested use of one subject, oldest first (paged past the 1000-row limit) */
  listUses(subject: MetaSubject): Promise<Use[]>;
  /**
   * Sets one status on many uses in one request; back to 'suggested' (undo) skips collected uses.
   * Returns the ids it changed; no-op for no ids.
   */
  decideUses(ids: string[], status: UseStatus): Promise<string[]>;
  /** Changes the crop and/or the subject of one uncollected use. */
  updateUse(id: string, change: { crop?: Crop; subject?: MetaSubject }): Promise<void>;
}

/** Reading uses before supabase/migrations/0005_media_uses.sql has created the table. */
export class UsesUnavailable extends Error {
  constructor() {
    super('Run supabase/migrations/0005_media_uses.sql to review the agents’ suggestions');
  }
}

/** An adjusted use that would be the same as another use of its photo (unique key). */
export class DuplicateUse extends Error {
  constructor() {
    super('That photo already has a use with this subject and crop.');
  }
}

/** PostgREST: PGRST205 (or 42P01) for an unknown table. */
export function isMissingUses(error: unknown): boolean {
  const { code, message = '' } = (error ?? {}) as PostgrestError;
  return (code === 'PGRST205' || code === '42P01') && /media_uses/.test(message);
}

/** An undo refused because the photo is already in the cards. */
export class AlreadyCollected extends Error {
  constructor() {
    super('That photo is already in the cards, so it can’t be undone here.');
  }
}

/** Saving a crop before supabase/migrations/0004_crop.sql has added the column. */
export class CropUnavailable extends Error {
  constructor() {
    super('Run supabase/migrations/0004_crop.sql to enable cropping');
  }
}

interface PostgrestError {
  code?: string;
  message?: string;
}

/** PostgREST: PGRST204 for an unknown column in a write, 42703 for one in a select. */
export function isMissingCrop(error: unknown): boolean {
  const { code, message = '' } = (error ?? {}) as PostgrestError;
  return (code === 'PGRST204' || code === '42703') && /\bcrop\b/.test(message);
}

interface Row {
  id: string;
  country: string;
  subject: MetaSubject;
  source: Candidate['source'];
  source_url: string;
  storage_path: string;
  preview: string | null;
  credit: string;
  licence: string;
  title: string | null;
  description: string | null;
  caption: string | null;
  giveaways: string[] | null;
  width?: number | null;
  height?: number | null;
  crop?: Crop | null;
}

interface UseRow {
  id: string;
  candidate_id: string;
  subject: MetaSubject;
  crop: Crop;
  note: string | null;
  candidate: {
    country: string;
    storage_path: string;
    width: number | null;
    height: number | null;
    preview: string | null;
    credit: string;
    source_url: string;
    title: string | null;
    description: string | null;
  };
}

const USE_COLUMNS =
  'id,candidate_id,subject,crop,note,candidate:media_candidates(country,storage_path,width,height,preview,credit,source_url,title,description)';

const PAGE = 1000;
const COLUMNS =
  'id,country,subject,source,source_url,storage_path,width,height,preview,credit,licence,title,description,caption,giveaways';

export function supabaseCuration(client: SupabaseClient): CurationApi {
  /** false once the database has said media_candidates has no crop column yet */
  let hasCrop = true;

  /** Runs an update that writes crop; without the column, retries it once without crop. */
  async function clearingCrop<R extends { error: unknown }>(
    update: (withCrop: boolean) => PromiseLike<R>,
  ): Promise<R> {
    if (hasCrop) {
      const result = await update(true);
      if (!isMissingCrop(result.error)) return result;
      hasCrop = false;
    }
    return update(false);
  }

  return {
    async isAdmin() {
      // RLS only lets a user read their own app_admins row
      const { data, error } = await client.from('app_admins').select('user_id').limit(1);
      return !error && (data?.length ?? 0) > 0;
    },
    async listPending() {
      // PostgREST returns at most 1000 rows per request, so page through the whole queue
      const rows: Row[] = [];
      for (let from = 0; ; from += PAGE) {
        const page = () =>
          client
            .from('media_candidates')
            .select(hasCrop ? `${COLUMNS},crop` : COLUMNS)
            .eq('status', 'pending')
            .order('created_at')
            .order('id')
            .range(from, from + PAGE - 1);
        let { data, error } = await page();
        if (hasCrop && isMissingCrop(error)) {
          hasCrop = false;
          ({ data, error } = await page());
        }
        if (error) throw error;
        rows.push(...(data as unknown as Row[]));
        if ((data?.length ?? 0) < PAGE) break;
      }
      return rows.map((row) => ({
        id: row.id,
        country: row.country,
        subject: row.subject,
        source: row.source,
        sourceUrl: row.source_url,
        storagePath: row.storage_path,
        preview: row.preview,
        credit: row.credit,
        licence: row.licence,
        title: row.title,
        description: row.description,
        caption: row.caption,
        giveaways: row.giveaways ?? [],
        width: row.width ?? null,
        height: row.height ?? null,
        crop: row.crop ?? null,
      }));
    },
    async decide(id, { status, subject, giveaways, caption, crop }) {
      // only the columns the migrations grant UPDATE on (0003_media.sql, 0004_crop.sql)
      const run = (withCrop: boolean) => {
        let query = client
          .from('media_candidates')
          .update({
            status,
            subject,
            giveaways,
            caption,
            ...(withCrop && crop !== undefined ? { crop } : {}),
            decided_at: status === 'pending' ? null : new Date().toISOString(),
          })
          .eq('id', id);
        // an undo must not pull a photo back out of the cards
        if (status === 'pending') query = query.is('collected_at', null);
        return query.select('id');
      };
      // a crop being saved needs the column; clearing one (undo) can do without it
      const { data, error } = crop ? await run(true) : await clearingCrop(run);
      if (isMissingCrop(error)) throw new CropUnavailable();
      if (error) throw error;
      if (status === 'pending' && !data?.length) throw new AlreadyCollected();
    },
    async decideMany(ids, status) {
      if (!ids.length) return [];
      const undo = status === 'pending';
      const run = (withCrop: boolean) => {
        let query = client
          .from('media_candidates')
          .update({
            status,
            // an undone row comes back uncropped
            ...(undo && withCrop ? { crop: null } : {}),
            decided_at: undo ? null : new Date().toISOString(),
          })
          .in('id', ids);
        if (undo) query = query.is('collected_at', null);
        return query.select('id');
      };
      const { data, error } = undo ? await clearingCrop(run) : await run(false);
      if (error) throw error;
      return (data as { id: string }[]).map((row) => row.id);
    },
    async setCrop(id, crop) {
      const { error } = await client
        .from('media_candidates')
        .update({ crop })
        .eq('id', id)
        .is('collected_at', null)
        .select('id');
      if (isMissingCrop(error)) {
        hasCrop = false;
        throw new CropUnavailable();
      }
      if (error) throw error;
    },
    async countUses() {
      const counts: Partial<Record<MetaSubject, number>> = {};
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client
          .from('media_uses')
          .select('subject')
          .eq('status', 'suggested')
          .order('id')
          .range(from, from + PAGE - 1);
        if (isMissingUses(error)) throw new UsesUnavailable();
        if (error) throw error;
        for (const { subject } of data as { subject: MetaSubject }[]) {
          counts[subject] = (counts[subject] ?? 0) + 1;
        }
        if ((data?.length ?? 0) < PAGE) return counts;
      }
    },
    async listUses(subject) {
      const rows: UseRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client
          .from('media_uses')
          .select(USE_COLUMNS)
          .eq('status', 'suggested')
          .eq('subject', subject)
          .order('created_at')
          .order('id')
          .range(from, from + PAGE - 1);
        if (isMissingUses(error)) throw new UsesUnavailable();
        if (error) throw error;
        rows.push(...(data as unknown as UseRow[]));
        if ((data?.length ?? 0) < PAGE) break;
      }
      return rows.map(({ candidate: c, ...row }) => ({
        id: row.id,
        candidateId: row.candidate_id,
        subject: row.subject,
        crop: row.crop,
        note: row.note,
        country: c.country,
        storagePath: c.storage_path,
        width: c.width,
        height: c.height,
        preview: c.preview,
        credit: c.credit,
        sourceUrl: c.source_url,
        title: c.title,
        description: c.description,
      }));
    },
    async decideUses(ids, status) {
      if (!ids.length) return [];
      const undo = status === 'suggested';
      // only the columns 0005_media_uses.sql grants UPDATE on
      let query = client
        .from('media_uses')
        .update({ status, decided_at: undo ? null : new Date().toISOString() })
        .in('id', ids);
      if (undo) query = query.is('collected_at', null);
      const { data, error } = await query.select('id');
      if (isMissingUses(error)) throw new UsesUnavailable();
      if (error) throw error;
      return (data as { id: string }[]).map((row) => row.id);
    },
    async updateUse(id, change) {
      const { error } = await client
        .from('media_uses')
        .update(change)
        .eq('id', id)
        .is('collected_at', null)
        .select('id');
      if (isMissingUses(error)) throw new UsesUnavailable();
      if ((error as PostgrestError | null)?.code === '23505') throw new DuplicateUse();
      if (error) throw error;
    },
  };
}
