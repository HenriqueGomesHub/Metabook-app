import type { Config, ExtensionRound } from './messages';

/** Only Supabase edge function URLs for ingest-rounds are ever called. */
export const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/ingest-rounds\/?$/;

export type SendResult =
  | { kind: 'ok' }
  | { kind: 'disabled' }
  | { kind: 'unauthorized' }
  | { kind: 'invalid'; error: string }
  | { kind: 'error'; error: string };

/** Runs in the background service worker only (Origin: chrome-extension://). No retries. */
export async function sendBatch(config: Config, rounds: ExtensionRound[]): Promise<SendResult> {
  try {
    const res = await fetch(config.url, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', 'x-metabook-token': config.token },
      body: JSON.stringify(rounds),
    });
    if (res.ok) return { kind: 'ok' };
    if (res.status === 403) return { kind: 'disabled' };
    if (res.status === 401) return { kind: 'unauthorized' };
    if (res.status === 400) return { kind: 'invalid', error: 'server rejected data (400)' };
    return { kind: 'error', error: `HTTP ${res.status}` };
  } catch {
    return { kind: 'error', error: 'network error' };
  }
}
