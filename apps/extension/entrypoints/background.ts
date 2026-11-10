import type { ContentMessage, ExtensionRound, Message } from '../src/messages';
import {
  getConfig,
  getQueue,
  getStatus,
  markSeen,
  patchStatus,
  setLastRound,
  setQueue,
} from '../src/storage';
import { SUPABASE_URL_RE, sendBatch, type SendResult } from '../src/ingest';

async function applyResult(result: SendResult, sent: ExtensionRound[], queue: ExtensionRound[]) {
  const now = new Date().toISOString();
  switch (result.kind) {
    case 'ok':
      await setQueue(queue.slice(sent.length));
      await patchStatus({ paired: true, enabled: true, lastCaptureAt: now, lastError: undefined });
      break;
    case 'disabled':
      await patchStatus({ paired: true, enabled: false, lastError: 'capture disabled (403)' });
      break;
    case 'unauthorized':
      await patchStatus({ paired: false, lastError: 'token rejected (401)' });
      break;
    case 'invalid': // never retry a batch the server called malformed
      await setQueue(queue.slice(sent.length));
      await patchStatus({ lastError: result.error });
      break;
    default:
      await patchStatus({ lastError: result.error });
  }
}

/** Sends the stored queue once (max 50). Called only after a newly captured round, or never retried on a timer. */
async function flush() {
  const status = await getStatus();
  if (status.enabled === false) return; // kill switch: wait for popup re-check
  const config = await getConfig();
  if (!config?.token || !SUPABASE_URL_RE.test(config.url)) {
    await patchStatus({ lastError: 'not configured' });
    return;
  }
  const queue = await getQueue();
  if (queue.length === 0) return;
  const batch = queue.slice(0, 50);
  await applyResult(await sendBatch(config, batch), batch, queue);
}

async function onContent(message: ContentMessage) {
  const now = new Date().toISOString();
  if (message.type === 'parse-failed') {
    await patchStatus({ parse: { ok: false, reason: message.reason, at: now } });
    return;
  }
  if (!(await markSeen(message.gameKey))) return;
  await patchStatus({ parse: { ok: true, at: now } });
  await setLastRound({ truth: message.round.truth.country, guess: message.round.guess.country, at: now });
  await setQueue([...(await getQueue()), message.round]);
  await flush();
}

/** Manual re-check: POST an empty array. 403 => disabled, 400 => token valid and enabled, 401 => bad token. */
async function recheck() {
  const config = await getConfig();
  if (!config?.token || !SUPABASE_URL_RE.test(config.url)) {
    await patchStatus({ paired: false, lastError: 'not configured' });
    return;
  }
  const result = await sendBatch(config, []);
  if (result.kind === 'disabled') {
    await patchStatus({ paired: true, enabled: false, lastError: undefined });
  } else if (result.kind === 'unauthorized') {
    await patchStatus({ paired: false, lastError: 'token rejected (401)' });
  } else if (result.kind === 'invalid' || result.kind === 'ok') {
    await patchStatus({ paired: true, enabled: true, lastError: undefined });
  } else {
    await patchStatus({ lastError: result.error });
  }
}

chrome.runtime.onMessage.addListener((raw: unknown, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  const message = raw as Message;
  if (message.type === 'recheck') return recheck().then(() => ({ ok: true }));
  if (message.type === 'capture' || message.type === 'parse-failed') {
    return onContent(message).then(() => ({ ok: true }));
  }
  return;
});

/** Toolbar icon opens the side panel (there is no popup). */
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
