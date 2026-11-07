import type { PopupMessage } from '../src/messages';
import { getConfig, getStatus, setConfig } from '../src/storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const yesNo = (v: boolean | undefined, yes: string, no: string) =>
  v === undefined ? 'unknown' : v ? yes : no;

async function render() {
  const status = await getStatus();
  $('paired').textContent = yesNo(status.paired, 'yes', 'no');
  $('enabled').textContent = yesNo(status.enabled, 'enabled', 'disabled');
  $('last').textContent = status.lastCaptureAt ? new Date(status.lastCaptureAt).toLocaleString() : 'never';
  $('parse').textContent = status.parse
    ? `${status.parse.ok ? 'ok' : `failed: ${status.parse.reason ?? 'unknown'}`} (${new Date(status.parse.at).toLocaleString()})`
    : 'none';
  $('error').textContent = status.lastError ?? 'none';
}

async function init() {
  const config = await getConfig();
  const envUrl = __INGEST_URL__ || undefined;
  $<HTMLInputElement>('url').value = config?.url ?? envUrl ?? '';
  $<HTMLInputElement>('token').value = config?.token ?? '';
  await render();
}

$('form').addEventListener('submit', (event) => {
  event.preventDefault();
  void setConfig({
    url: $<HTMLInputElement>('url').value.trim(),
    token: $<HTMLInputElement>('token').value.trim(),
  }).then(render);
});

$('check').addEventListener('click', () => {
  const message: PopupMessage = { type: 'recheck' };
  void chrome.runtime.sendMessage(message).then(render, render);
});

void init();
