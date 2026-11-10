// Supabase Storage REST with the service role key. Default: the public `media` bucket holding
// candidates/<id>.webp until approved, then approved/<id>.webp (ids are hashes: no country in any path).
// The private `clues` bucket (clue images) uses the same client with `bucket: 'clues', isPublic: false`.
// CLI: node tools/content/storage.mjs --ensure
import { env, HttpError, isMain, parseArgs, request, supabaseHeaders } from './lib/common.mjs';

export function createStorage({
  url = env('SUPABASE_URL'),
  key = env('SUPABASE_SERVICE_ROLE_KEY'),
  bucket = 'media',
  isPublic = true,
} = {}) {
  const base = `${url.replace(/\/$/, '')}/storage/v1`;
  const headers = supabaseHeaders(key);
  const json = (method, path, body) =>
    request(`${base}${path}`, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
    }, { retries: 2 });

  /** True when a file is at `path` in the public bucket. */
  const exists = async (path) => (await fetch(`${base}/object/public/${bucket}/${path}`, { method: 'HEAD' })).ok;

  return {
    publicUrl: (path) => `${base}/object/public/${bucket}/${path}`,

    /** Creates the bucket when it does not exist yet. */
    async ensureBucket() {
      try {
        await json('GET', `/bucket/${bucket}`);
      } catch (error) {
        if (!(error instanceof HttpError) || ![400, 404].includes(error.status)) throw error;
        await json('POST', '/bucket', { id: bucket, name: bucket, public: isPublic });
      }
    },

    async upload(path, body, contentType = 'image/webp') {
      await request(`${base}/object/${bucket}/${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': contentType, 'x-upsert': 'true' },
        body,
      });
    },

    exists,

    /** The bytes of a file in the public bucket. */
    async download(path) {
      return Buffer.from(await (await request(`${base}/object/public/${bucket}/${path}`, {}, { timeoutMs: 120_000 })).arrayBuffer());
    },

    /** Every object path under `prefix` (folders walked), listed 1000 at a time. */
    async listAll(prefix = '') {
      const paths = [];
      for (let offset = 0; ; offset += 1000) {
        const res = await json('POST', `/object/list/${bucket}`, { prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
        const entries = await res.json();
        for (const e of entries) {
          const path = prefix ? `${prefix}/${e.name}` : e.name;
          // folders come back without an id
          if (e.id == null) paths.push(...(await this.listAll(path)));
          else paths.push(path);
        }
        if (entries.length < 1000) return paths;
      }
    },

    /** Deletes objects, 100 per request. → how many were deleted. */
    async remove(paths) {
      let removed = 0;
      for (let i = 0; i < paths.length; i += 100) {
        const res = await json('DELETE', `/object/${bucket}`, { prefixes: paths.slice(i, i + 100) });
        removed += (await res.json()).length;
      }
      return removed;
    },

    /** Moves a file; a file already at `to` (an earlier, interrupted run) counts as moved. */
    async move(from, to) {
      try {
        await json('POST', '/object/move', { bucketId: bucket, sourceKey: from, destinationKey: to });
      } catch (error) {
        if (!(await exists(to))) throw error;
      }
    },
  };
}

if (isMain(import.meta)) {
  if (parseArgs().ensure) {
    await createStorage().ensureBucket();
    console.log('bucket media ready');
  }
}
