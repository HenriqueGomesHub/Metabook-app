// Supabase Storage REST with the service role key: a public `media` bucket holding
// candidates/<id>.webp until approved, then approved/<id>.webp (ids are hashes: no country in any path).
// CLI: node tools/content/storage.mjs --ensure
import { env, HttpError, isMain, parseArgs, request, supabaseHeaders } from './lib/common.mjs';

export const BUCKET = 'media';

export function createStorage({
  url = env('SUPABASE_URL'),
  key = env('SUPABASE_SERVICE_ROLE_KEY'),
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
  const exists = async (path) => (await fetch(`${base}/object/public/${BUCKET}/${path}`, { method: 'HEAD' })).ok;

  return {
    publicUrl: (path) => `${base}/object/public/${BUCKET}/${path}`,

    /** Creates the public bucket when it does not exist yet. */
    async ensureBucket() {
      try {
        await json('GET', `/bucket/${BUCKET}`);
      } catch (error) {
        if (!(error instanceof HttpError) || ![400, 404].includes(error.status)) throw error;
        await json('POST', '/bucket', { id: BUCKET, name: BUCKET, public: true });
      }
    },

    async upload(path, body, contentType = 'image/webp') {
      await request(`${base}/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': contentType, 'x-upsert': 'true' },
        body,
      });
    },

    exists,

    /** Moves a file; a file already at `to` (an earlier, interrupted run) counts as moved. */
    async move(from, to) {
      try {
        await json('POST', '/object/move', { bucketId: BUCKET, sourceKey: from, destinationKey: to });
      } catch (error) {
        if (!(await exists(to))) throw error;
      }
    },
  };
}

if (isMain(import.meta)) {
  if (parseArgs().ensure) {
    await createStorage().ensureBucket();
    console.log(`bucket ${BUCKET} ready`);
  }
}
