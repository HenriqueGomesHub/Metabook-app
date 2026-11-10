import type { LastRound, PopupMessage } from '../src/messages';
import { buildRoundUrl } from '../src/roundUrl';
import { getConfig, getLastRound, getStatus, setConfig } from '../src/storage';

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

let roundUrl: string | undefined;

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function renderRound(round: LastRound | undefined) {
  const next = round ? buildRoundUrl(__APP_URL__, round) : undefined;
  $('headline').textContent = round ? `Last round: ${countryName(round.truth)}` : 'No round captured yet';
  $('open').hidden = !next;
  if (next === roundUrl) return;
  roundUrl = next;
  const frame = $<HTMLIFrameElement>('frame');
  frame.hidden = !next;
  if (next) frame.src = next;
  else frame.removeAttribute('src');
}

function showSettings(show: boolean) {
  $('settings-view').hidden = !show;
  $('round-view').hidden = show;
  if (show) void render();
}

async function init() {
  renderRound(await getLastRound());
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

$('open').addEventListener('click', () => {
  if (roundUrl) void chrome.tabs.create({ url: roundUrl });
});
$('to-settings').addEventListener('click', () => showSettings(true));
$('to-round').addEventListener('click', () => showSettings(false));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.lastRound) renderRound(changes.lastRound.newValue as LastRound | undefined);
  if (changes.status && !$('settings-view').hidden) void render();
});
