# Metabook companion extension (prototype, do not publish)

Chrome MV3 extension (WXT). After you finish a round of GeoGuessr it reads the visible result screen, and sends `truth.country`, `guess.country`, distance and score to your own Metabook (`ingest-rounds` edge function) so mistakes feed your drills. Spec: `docs/spec.md` section 9.

## Security rules (checklist)

- [x] Permissions: only `storage`.
- [x] `host_permissions`: only the ingest endpoint (`VITE_METABOOK_INGEST_URL` at build time, else `https://*.supabase.co/functions/v1/ingest-rounds`). No geoguessr.com host permission.
- [x] One content script, `matches: ["https://www.geoguessr.com/game/*"]`, isolated world, `document_idle`.
- [x] No `web_accessible_resources`, no page-world scripts, no `<script>` injection.
- [x] No patching of fetch/XHR/WebSocket/history; SPA navigation is detected by polling `location.pathname` every 2 s.
- [x] No DOM writes, styles or UI on GeoGuessr. The popup is the only UI.
- [x] Runtime guard: if the path does not start with `/game/`, observers are disconnected.
- [x] Reads only after a result screen appears (read-only MutationObserver, 500 ms debounce).
- [x] At most one capture per game token + round number (checked in content script and, persistently, in background).
- [x] The content script never makes network requests; the background service worker sends (Origin `chrome-extension://`).
- [x] Fails silent: on parse failure it records `{ok:false, reason, at}` and stops observing that game. No retries or probing.
- [x] Network errors keep the queue in storage; sending is retried only when the next round is captured (no timers).
- [x] Kill switch: a 403 marks capture disabled and nothing is sent until you press "Check status" in the popup.
- [x] Rounds without both country names visible are skipped (reason `no-country`); nothing is fabricated.

Skipped-round reasons: `no-country`, `no-round`, `parse-error`.

## Selectors are UNVERIFIED

The author had no access to geoguessr.com. Every selector and regex in `src/parser.ts` (`SEL_*`, `RE_*`) is a guess, and the unit tests only cover hand-written HTML. Before relying on it, open a single-player game, inspect the result screen in DevTools, and fix the constants. Country names also need to be actually shown on that screen; if GeoGuessr does not show them, nothing will ever be captured.

## Build and load

```
cp .env.example .env.local     # set VITE_METABOOK_INGEST_URL=https://<ref>.supabase.co/functions/v1/ingest-rounds
npm run build -w @metabook/extension   # from repo root; output in apps/extension/.output/chrome-mv3
```

Chrome: `chrome://extensions` > Developer mode > Load unpacked > select `apps/extension/.output/chrome-mv3`. Other scripts: `dev` (WXT dev mode, adds dev-only permissions, do not use for real play), `zip`, `test`, `typecheck`.

## Pair

In Metabook, Settings > Extension creates a pairing token (shown once). Open the extension popup, check the URL, paste the token, Save, then "Check status". "Paired: yes" and "Capture: enabled" mean the server accepted it.

## Testing safely

- Test on **single-player** games only, on your own account. Never test with a second account.
- First load it unpacked with the real site closed, check the popup, then play one casual game while watching the popup status.
- If anything looks off, disable the extension in `chrome://extensions`.
- Kill switch for everyone: `update app_flags set capture_enabled = false;` (see `supabase/README.md`).
