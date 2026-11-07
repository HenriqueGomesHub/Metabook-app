import type { Config, ExtensionRound, Status } from './messages';

const MAX_SEEN = 500;
const MAX_QUEUE = 200;

async function get<T>(key: string): Promise<T | undefined> {
  const out = await chrome.storage.local.get(key);
  return out[key] as T | undefined;
}

export const getConfig = () => get<Config>('config');
export const setConfig = (config: Config) => chrome.storage.local.set({ config });

export async function getStatus(): Promise<Status> {
  return (await get<Status>('status')) ?? {};
}
export async function patchStatus(patch: Partial<Status>): Promise<Status> {
  const next = { ...(await getStatus()), ...patch };
  await chrome.storage.local.set({ status: next });
  return next;
}

export async function getQueue(): Promise<ExtensionRound[]> {
  return (await get<ExtensionRound[]>('queue')) ?? [];
}
export const setQueue = (queue: ExtensionRound[]) =>
  chrome.storage.local.set({ queue: queue.slice(-MAX_QUEUE) });

/** Returns true if the key was new (and records it). */
export async function markSeen(key: string): Promise<boolean> {
  const seen = (await get<string[]>('seen')) ?? [];
  if (seen.includes(key)) return false;
  await chrome.storage.local.set({ seen: [...seen, key].slice(-MAX_SEEN) });
  return true;
}
