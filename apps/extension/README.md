# Metabook companion extension (prototype, do not publish)

Chrome MV3 extension (with a side panel showing your last round in Metabook), bundled with plain esbuild (no WXT, no framework runtime). After you finish a round of GeoGuessr it reads the visible result screen, and sends `truth.country`, `guess.country`, distance and score to your own Metabook (`ingest-rounds` edge function) so mistakes feed your drills. Spec: `docs/spec.md` section 9.

## Security rules (checklist)

- [x] Permissions: exactly `storage` and `sidePanel` (the bundle check enforces the list).
- [x] `host_permissions`: only the ingest endpoint (`VITE_METABOOK_INGEST_URL` at build time, else `https://*.supabase.co/functions/v1/ingest-rounds`). No geoguessr.com host permission.
- [x] One content script, `matches: ["https://www.geoguessr.com/game/*"]`, isolated world, `document_idle`.
- [x] No `web_accessible_resources`, no page-world scripts, no `<script>` injection.
- [x] No patching of fetch/XHR/WebSocket/history; SPA navigation is detected by polling `location.pathname` every 2 s.
- [x] No framework runtime in the content script (no WXT, no wrapper that dispatches events or posts messages to the page). `scripts/check-bundle.mjs` runs after every build and fails it if `dist/content.js` contains postMessage, dispatchEvent, CustomEvent, fetch(, XMLHttpRequest, WebSocket, createElement, innerHTML, insertAdjacent, appendChild, setAttribute, classList, .style, console., eval( or new Function, or if the manifest has `web_accessible_resources`, `externally_connectable` or permissions other than `storage`.
- [x] No DOM writes, styles or UI on GeoGuessr. The side panel (an extension page outside GeoGuessr's page) is the only UI; nothing runs during a round.
- [x] Side panel framing: extension pages have no `frame-src` restriction under Chrome's default CSP, so no `content_security_policy` is set (the bundle check fails if one appears). The iframe only ever points at `VITE_METABOOK_APP_URL` (default `https://metabook-app.vercel.app`, https only); no host permission is needed for it. If you ever tighten the CSP, use only `frame-src https://metabook-app.vercel.app`.
- [x] Content script matches stay exactly `https://www.geoguessr.com/game/*` (single-player classic). Duels, ranked, battle royale and live challenge URLs never match; `src/roundUrl.test.ts` and the bundle check assert it.
- [x] Runtime guard: if the path does not start with `/game/`, observers are disconnected.
- [x] Reads only after a result screen appears (read-only MutationObserver, 500 ms debounce).
- [x] At most one capture per game token + round number (checked in content script and, persistently, in background).
- [x] The content script never makes network requests; the background service worker sends (Origin `chrome-extension://`).
- [x] Fails silent: on parse failure it records `{ok:false, reason, at}` and stops observing that game. No retries or probing.
- [x] Network errors keep the queue in storage; sending is retried only when the next round is captured (no timers).
- [x] Kill switch: a 403 marks capture disabled and nothing is sent until you press "Check status" in the side panel Settings.
- [x] Rounds without both country names visible are skipped (reason `no-country`); nothing is fabricated.

Skipped-round reasons: `no-country`, `no-round`, `parse-error`.

## Side panel

Clicking the toolbar icon opens a Chrome side panel (`chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`). It shows `Last round: <truth country>`, an iframe of `<VITE_METABOOK_APP_URL>/round?truth=&guess=&region=&lat=&lng=` (only params that exist) and an "Open in Metabook" button (opens the same URL in a tab) in case the iframe cannot show the logged-in app (e.g. framing blocked by the web app's headers). When the background captures a round it stores `lastRound` `{truth, guess, region?, lat?, lng?, at}` in `chrome.storage.local`; the panel listens to storage changes and updates live. The old popup is gone: pairing and status now live in the panel's "Settings" button (same form, token and "Check status").

`region`, `lat` and `lng` are currently never set: the parser only reads country names, distance and score, and the result screen is not known to expose coordinates or a region as readable text. Add them in `src/parser.ts` only if you verify they are visible and readable read-only.

## Selectors are UNVERIFIED

The author had no access to geoguessr.com. Every selector and regex in `src/parser.ts` (`SEL_*`, `RE_*`) is a guess, and the unit tests only cover hand-written HTML. Before relying on it, open a single-player game, inspect the result screen in DevTools, and fix the constants. Country names also need to be actually shown on that screen; if GeoGuessr does not show them, nothing will ever be captured.

## Build and load

```
cp .env.example .env.local     # set VITE_METABOOK_INGEST_URL=https://<ref>.supabase.co/functions/v1/ingest-rounds (optional VITE_METABOOK_APP_URL)
npm run build -w @metabook/extension   # from repo root; builds apps/extension/dist and runs the bundle check
```

Chrome 114+: `chrome://extensions` > Developer mode > Load unpacked > select `apps/extension/dist`. Other scripts: `dev` (esbuild watch), `test`, `typecheck`. The env var is read from the process environment or `.env.local`.

## Behaviour to know

- Capture only starts on a **full page load** of a `/game/` URL. Content scripts are not injected on in-app (SPA) navigation, so if you reach a game from another GeoGuessr page, reload it once.
- On `no-country` (result screen has no country names), capture stops for that **whole game**, not just that round.
- A 403 from the server can mean the **kill switch** is on OR the request **origin is wrong** (the function rejects unexpected origins). Check both before assuming capture was disabled on purpose.

## Pair

In Metabook, Settings > Extension creates a pairing token (shown once). Open the side panel > Settings, check the URL, paste the token, Save, then "Check status". "Paired: yes" and "Capture: enabled" mean the server accepted it.

## Testing safely

- Test on **single-player** games only, on your own account. Never test with a second account.
- First load it unpacked with the real site closed, check the side panel, then play one casual game while watching Settings status.
- If anything looks off, disable the extension in `chrome://extensions`.
- Kill switch for everyone: `update app_flags set capture_enabled = false;` (see `supabase/README.md`).
