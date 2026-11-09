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
}

export interface Decision {
  status: 'pending' | 'approved' | 'rejected';
  subject: MetaSubject;
  giveaways: string[];
  caption: string | null;
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
   * Back to 'pending' skips collected rows. Returns the ids it changed.
   */
  decideMany(ids: string[], status: Decision['status']): Promise<string[]>;
}

/** An undo refused because the photo is already in the cards. */
export class AlreadyCollected extends Error {
  constructor() {
    super('That photo is already in the cards, so it can’t be undone here.');
  }
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
}

const PAGE = 1000;

export function supabaseCuration(client: SupabaseClient): CurationApi {
  return {
    async isAdmin() {
      // RLS only lets a user read their own app_admins row
      const { data, error } = await client.from('app_admins').select('user_id').limit(1);
      return !error && (data?.length ?? 0) > 0;
    },
    async listPending() {
      const { data, error } = await client
        .from('media_candidates')
        .select(
          'id,country,subject,source,source_url,storage_path,preview,credit,licence,title,description,caption,giveaways',
        )
        .eq('status', 'pending')
        .order('created_at')
        .limit(PAGE);
      if (error) throw error;
      return (data as Row[]).map((row) => ({
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
      }));
    },
    async decide(id, { status, subject, giveaways, caption }) {
      // only the columns the migration grants UPDATE on (0003_media.sql)
      let query = client
        .from('media_candidates')
        .update({
          status,
          subject,
          giveaways,
          caption,
          decided_at: status === 'pending' ? null : new Date().toISOString(),
        })
        .eq('id', id);
      // an undo must not pull a photo back out of the cards
      if (status === 'pending') query = query.is('collected_at', null);
      const { data, error } = await query.select('id');
      if (error) throw error;
      if (status === 'pending' && !data?.length) throw new AlreadyCollected();
    },
    async decideMany(ids, status) {
      if (!ids.length) return [];
      let query = client
        .from('media_candidates')
        .update({
          status,
          decided_at: status === 'pending' ? null : new Date().toISOString(),
        })
        .in('id', ids);
      if (status === 'pending') query = query.is('collected_at', null);
      const { data, error } = await query.select('id');
      if (error) throw error;
      return (data as { id: string }[]).map((row) => row.id);
    },
  };
}
