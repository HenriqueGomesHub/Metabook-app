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
  /** path in the `media` bucket, e.g. "candidates/pl/pl-c123.webp" */
  storagePath: string;
  preview: string | null;
  credit: string;
  licence: string;
  title: string | null;
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
  /** writes a decision; back to 'pending' (undo) clears decided_at */
  decide(id: string, decision: Decision): Promise<void>;
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
          'id,country,subject,source,source_url,storage_path,preview,credit,licence,title,caption,giveaways',
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
        caption: row.caption,
        giveaways: row.giveaways ?? [],
      }));
    },
    async decide(id, { status, subject, giveaways, caption }) {
      const { error } = await client
        .from('media_candidates')
        .update({
          status,
          subject,
          giveaways,
          caption,
          decided_at: status === 'pending' ? null : new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
  };
}
