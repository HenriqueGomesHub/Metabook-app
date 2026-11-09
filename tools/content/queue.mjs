// The curation queue: media_candidates rows via PostgREST with the service role key.
// CLI: node tools/content/queue.mjs --approved   (lists approved rows not collected yet)
import { env, HttpError, isMain, parseArgs, request } from './lib/common.mjs';

export const MISSING_TABLE =
  'media_candidates table not found: run supabase/migrations/0003_media.sql in the Supabase SQL editor';

/** PostgREST reports an unknown table as PGRST205 (older versions: 42P01 or a 404). */
export function isMissingTable(error) {
  if (!(error instanceof HttpError)) return false;
  return /PGRST205|42P01|media_candidates/.test(error.body) && [400, 404].includes(error.status);
}

/** Candidate (camelCase, from commons/mapillary) → table row. */
export function toRow(candidate) {
  return {
    country: candidate.country,
    subject: candidate.subject,
    region: candidate.region ?? null,
    source: candidate.source,
    source_url: candidate.sourceUrl,
    storage_path: candidate.storagePath,
    width: candidate.width,
    height: candidate.height,
    preview: candidate.preview ?? null,
    credit: candidate.credit,
    licence: candidate.licence,
    licence_url: candidate.licenceUrl ?? null,
    title: candidate.title ?? null,
    lat: candidate.lat ?? null,
    lon: candidate.lon ?? null,
    caption: candidate.caption ?? null,
  };
}

export function createQueue({
  url = env('SUPABASE_URL'),
  key = env('SUPABASE_SERVICE_ROLE_KEY'),
} = {}) {
  const base = `${url.replace(/\/$/, '')}/rest/v1/media_candidates`;
  const headers = { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' };
  async function call(query, init = {}) {
    try {
      const res = await request(`${base}${query}`, { ...init, headers: { ...headers, ...init.headers } }, { retries: 2 });
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (isMissingTable(error)) throw new Error(MISSING_TABLE);
      throw error;
    }
  }

  return {
    /** source_url of every row for a country, whatever its status, so re-runs skip them. */
    async knownSourceUrls(country) {
      const rows = await call(`?select=source_url&country=eq.${country}`);
      return new Set(rows.map((r) => r.source_url));
    },

    /** Inserts; a source_url already queued is left untouched (keeps its status). */
    async insert(candidates) {
      if (candidates.length === 0) return;
      await call('?on_conflict=source_url', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(candidates.map(toRow)),
      });
    },

    async listApproved() {
      return call('?select=*&status=eq.approved&collected_at=is.null&order=created_at.asc');
    },

    async markCollected(id, at = new Date().toISOString()) {
      await call(`?id=eq.${id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ collected_at: at }),
      });
    },
  };
}

if (isMain(import.meta)) {
  if (parseArgs().approved) console.log(JSON.stringify(await createQueue().listApproved(), null, 2));
}
