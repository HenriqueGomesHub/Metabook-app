// The curation queue: media_candidates rows (and their agent-suggested media_uses) via PostgREST
// with the service role key.
// CLI: node tools/content/queue.mjs --approved   (lists approved rows not collected yet)
import { env, HttpError, isMain, parseArgs, request, supabaseHeaders } from './lib/common.mjs';

export const MISSING_TABLE =
  'media_candidates table not found: run supabase/migrations/0003_media.sql in the Supabase SQL editor';

export const MISSING_USES =
  'media_uses table not found: run supabase/migrations/0005_media_uses.sql in the Supabase SQL editor';

/** PostgREST reports an unknown table as PGRST205 (older versions: 42P01 or a 404). */
export function isMissingTable(error, table = 'media_candidates') {
  if (!(error instanceof HttpError)) return false;
  return new RegExp(`PGRST205|42P01|${table}`).test(error.body) && [400, 404].includes(error.status);
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
    description: candidate.description ?? null,
  };
}

/** PostgREST caps a response (1000 rows by default), so lists are read a page at a time. */
const PAGE = 1000;

export function createQueue({
  url = env('SUPABASE_URL'),
  key = env('SUPABASE_SERVICE_ROLE_KEY'),
} = {}) {
  const rest = `${url.replace(/\/$/, '')}/rest/v1`;
  const headers = { ...supabaseHeaders(key), 'Content-Type': 'application/json' };
  async function call(query, init = {}, table = 'media_candidates') {
    try {
      const res = await request(`${rest}/${table}${query}`, { ...init, headers: { ...headers, ...init.headers } }, { retries: 2 });
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (table === 'media_uses' && isMissingTable(error, table)) throw new Error(MISSING_USES);
      if (isMissingTable(error)) throw new Error(MISSING_TABLE);
      throw error;
    }
  }
  /** Every row a query matches, a page at a time. */
  async function all(query, table) {
    const rows = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await call(`${query}&limit=${PAGE}&offset=${offset}`, {}, table);
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }
  /** PATCHes `values` onto the rows with these ids (100 per request) → the ids it changed. */
  async function patch(ids, values, { filter = '', table = 'media_candidates' } = {}) {
    const changed = [];
    for (let i = 0; i < ids.length; i += 100) {
      const rows = await call(`?id=in.(${ids.slice(i, i + 100).join(',')})${filter}&select=id`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(values),
      }, table);
      changed.push(...rows.map((r) => r.id));
    }
    return changed;
  }

  return {
    /** source_url of every row for a country, whatever its status, so re-runs skip them. */
    async knownSourceUrls(country) {
      const urls = new Set();
      for (let offset = 0; ; offset += PAGE) {
        const rows = await call(`?select=source_url&country=eq.${country}&order=id&limit=${PAGE}&offset=${offset}`);
        for (const r of rows) urls.add(r.source_url);
        if (rows.length < PAGE) return urls;
      }
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

    /**
     * Every approved row, collected or not: collect skips the ones already in content/media, so a
     * run whose push failed after an earlier run marked nothing is simply retried.
     */
    async listApproved({ uncollected = false } = {}) {
      const filter = uncollected ? '&collected_at=is.null' : '';
      return all(`?select=*&status=eq.approved${filter}&order=created_at.asc,id.asc`);
    },

    /** Every pending row (what the agents review), oldest first. */
    async listPending() {
      return all('?select=id,country,subject,source,storage_path,width,height,title,description&status=eq.pending&order=created_at.asc,id.asc');
    },

    /** id → status for the rows with these ids that exist. */
    async statuses(ids) {
      const out = new Map();
      for (let i = 0; i < ids.length; i += 100) {
        const rows = await call(`?select=id,status&id=in.(${ids.slice(i, i + 100).join(',')})`);
        for (const r of rows) out.set(r.id, r.status);
      }
      return out;
    },

    /** Sets a status (and decided_at) on the rows still pending; → the ids it changed. */
    async settlePending(ids, status, at = new Date().toISOString()) {
      return patch(ids, { status, ...(status === 'rejected' && { decided_at: at }) }, { filter: '&status=eq.pending' });
    },

    /** Moves every candidate of one country code to another (a territory folded into its country). */
    async renameCountry(from, to) {
      const rows = await call(`?country=eq.${from}&select=id`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ country: to }),
      });
      return rows.length;
    },

    /** Deletes the still-suggested uses of these candidates (a second review replaces them). */
    async deleteSuggestedUses(candidateIds) {
      for (let i = 0; i < candidateIds.length; i += 100) {
        await call(`?candidate_id=in.(${candidateIds.slice(i, i + 100).join(',')})&status=eq.suggested`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        }, 'media_uses');
      }
    },

    /** Moves agent-reviewed candidates to another status (e.g. rejected after a second pass). */
    async settleReviewed(ids, status, at = new Date().toISOString()) {
      return patch(ids, { status, decided_at: at }, { filter: '&status=eq.reviewed' });
    },

    /** Inserts suggested uses; one already there (same candidate, subject and crop) is left as it is. */
    async insertUses(uses) {
      for (let i = 0; i < uses.length; i += 500) {
        await call('?on_conflict=candidate_id,subject,crop', {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify(uses.slice(i, i + 500)),
        }, 'media_uses');
      }
    },

    /**
     * Approved uses not collected yet, each with its candidate row as `candidate`. Before
     * 0005_media_uses.sql there are none: → [].
     */
    async listApprovedUses() {
      try {
        return await all('?select=*,candidate:media_candidates(*)&status=eq.approved&collected_at=is.null&order=created_at.asc,id.asc', 'media_uses');
      } catch (error) {
        if (error.message === MISSING_USES) return [];
        throw error;
      }
    },

    /** Sets collected_at on the uses, 100 ids per request. */
    async markUsesCollected(ids, at = new Date().toISOString()) {
      await patch(ids, { collected_at: at }, { table: 'media_uses' });
    },

    /** Sets collected_at on the rows, 100 ids per request. */
    async markCollected(ids, at = new Date().toISOString()) {
      for (let i = 0; i < ids.length; i += 100) {
        await call(`?id=in.(${ids.slice(i, i + 100).join(',')})`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ collected_at: at }),
        });
      }
    },
  };
}

if (isMain(import.meta)) {
  if (parseArgs().approved) console.log(JSON.stringify(await createQueue().listApproved({ uncollected: true }), null, 2));
}
