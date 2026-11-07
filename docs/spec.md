# Metabook — build spec

Metabook is a GeoGuessr training app for one Master-rank player and a couple of friends. It trains country, region and precision knowledge with spaced repetition, interleaved drills, and a rotating tip after every answer. It does **not** clone GeoGuessr: real games come in through an optional extension, an import, or a manual log.

Visual reference: `docs/mockups/*.dc.html` (static HTML/CSS mockups of every screen — match their look, spacing, copy and motion; ignore the `<x-dc>`/`sc-for` template syntax).

## 1. Principles

- **Works with zero keys.** With no Supabase env vars the app runs in _local mode_: data in IndexedDB, no login, single user. With `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` it runs in _cloud mode_: Supabase Auth + Postgres. Same UI, same repository interface.
- **Minimal, correct code.** TypeScript strict. No dead code, no speculative abstractions, no unrequested features, no new dependencies without need. Small focused files.
- **Content is data.** Cards, tips, pools and maps live in `content/` as JSON and are versioned in git.
- Never use real personal names or the owner's city in placeholders or seed data. Fictional user: "Tom Reyes" (initials TR).

## 2. Repo layout (npm workspaces)

```
apps/web            React + Vite + TS PWA (the app)
apps/extension      Chrome MV3 companion extension (WXT)
packages/core       Pure TS learning logic, no React, no IO (fully unit tested)
content/            Seed JSON: cards, tips, pool, chapters, maps
supabase/           migrations/ (SQL + RLS), functions/ (edge functions)
docs/               spec.md, mockups/
```

Tooling: Node 22, npm workspaces, Vitest, ESLint (typescript-eslint), Prettier, Playwright (web smoke). Scripts at root: `dev`, `build`, `test`, `typecheck`, `lint`.

## 3. Design system

- Fonts: **Stack Sans Headline** (display, numbers) and **Stack Sans Text** (body) from Google Fonts.
- Tokens (CSS custom properties):
  - `--bg #12110F`, `--surface #1A1916`, `--raise #22211D`, `--line #2E2C27`, `--line-soft #24231F`
  - `--ink #EEEAE2`, `--muted #A39E92`, `--faint #8A857B` (decorative/12px+ only)
  - `--accent #A3C49A` (correct, location, primary action), `--accent-hover #B4D3AB`
  - `--warn #D9A35E` (your wrong pick, weak spots)
  - Medals: `--gold #D4B25E`, `--silver #BFC3C7`, `--bronze #B9805A`
- Subtle film grain overlay (SVG feTurbulence, opacity .08). No gradients, no glassmorphism, no emoji, no left-border cards.
- Radii: pills 999px, cards 18–24px. Touch targets ≥ 44px.
- **Navigation:** icon-only floating pill at bottom centre (Today, Drills, Street View/Games review, Atlas, Stats) with aria-labels. Hidden inside sessions/drills (those show a close button + thin progress bar instead).
- **Motion:** staggered rise-in on entry (<1s), bars grow, map trails draw, tips cross-fade on change, medals pop. Everything disabled under `prefers-reduced-motion`.
- Desktop first (1440×900), must still work at phone width.
- Accessible: real buttons/links/inputs with labels, 4.5:1 text contrast, keyboard shortcuts (Space = next, 1–5 = options, ←/→ = lookalike, Enter = submit).

## 4. Domain model

### Cards

Every learnable item is a card:

```
Card {
  id: string               // stable slug, e.g. "flag:lt", "script:georgian", "ddd:br:21", "region:br:south:araucaria"
  type: 'flag' | 'script' | 'meta' | 'lookalike' | 'region' | 'areacode' | 'plate'
  country: string          // ISO-3166 alpha-2 of the answer country ("BR")
  answer: string           // canonical answer (country name, region id, state code)
  options?: string[]       // for multiple-choice types
  prompt: { kind: 'flag'|'text'|'image'|'embed'|'svg', value: string, ratio?: string, lang?: string }
  tags: string[]           // e.g. ["europe","balkans","bollard"]
  chapter?: string         // e.g. "br:regions"
  source: string           // URL the fact was checked against
}
Tip { id, answer: string /* same key as Card.answer or region id */, scope: string /* drill type or 'any' */, text, source }
```

### Scheduling (packages/core)

- **FSRS** via `ts-fsrs`. Grading is automatic: wrong → Again; right after hint → Hard; right → Good; right and fast (< 40% of the card type's median time, or < 3s) → Easy.
- Multiple choice only for a card's first 2 reviews; then typed/recall where the type allows (flags, regions, scripts).
- **Daily session:** due reviews first, capped (default 200/day), plus new cards (default 15/day); target mix ≈ 70% review / 30% new; **interleave** types (never > 3 of the same type in a row).
- **Catch-up mode:** if overdue > 3× the daily cap, spread overdue across days instead of dumping.
- **Confusions:** every wrong answer upserts `(user, picked, truth)` with count. A pair with count ≥ 3 in the last 14 days enters a **contrast round**: back-to-back binary rounds between the two answers until 5 correct in a row, then the pair returns to normal FSRS scheduling.
- **Tip rotation:** after every answer (right or wrong) show the least-recently-seen tip for the answer; if wrong also show the least-recently-seen tip for the picked option. "Another tip" advances.
- **Mastery** of a set of cards (country/chapter/game) = mean FSRS retrievability now (cards never seen count 0). **Medals:** ≥ 80% gold, ≥ 50% silver, ≥ 25% bronze, else none. Medals can drop.
- **Scoring for map/round results:** `points = distance === 0 ? 5000 : round(5000 * exp(-km / k))`, haversine between capitals; `k = 700` for Brazil (configurable per country).
- **Training blocks:** see §6.
- **Placement test:** per country, a short mixed test (≤ 12 cards); correct answers mark those cards as already known (FSRS state seeded as reviewed-Good) so the deck doesn't start from zero.

## 5. Screens (apps/web)

Match the mockups. Routes:

| Route                 | Screen                                                                                                                                                                                                                           | Mockup                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `/`                   | Today: big due number, Start session, today's mix bar, weakest, top confusion, streak, active training block progress                                                                                                            | Main                                    |
| `/session`            | Session runner: renders the queue; per-type card components (flag typed, script MCQ, meta reveal, lookalike binary, region MCQ, area-code map); reveal panel with verdict, answer, tip box with "Tip n of m" + Another tip; Next | Card, Flags, Scripts, Lookalike, Region |
| `/drills`             | Drills hub: tiles per type with due + mastery; Mini-games tile                                                                                                                                                                   | Drills                                  |
| `/games`              | Mini-games hub (area codes etc; only Brazil area codes playable in v1, others listed as "soon")                                                                                                                                  | Games                                   |
| `/games/areacode/br`  | Area-code game on real borders: big code, hover shows state name, click scores by distance, reveal colours the first-digit group, trail line, rotating pattern tips, running total, medal                                        | AreaCode                                |
| `/atlas`              | Countries in the competitive pool by continent, mastery bar + medal, medal tally                                                                                                                                                 | Atlas                                   |
| `/atlas/:country`     | Country chapter (Brazil populated in v1): mastery ring, medal, chapters list with medal dots, Study, Add to focus, "Where you miss"                                                                                              | Country                                 |
| `/review`             | Game review: list of logged games/rounds, misses with tell + tips; **Log a game** (manual: guessed country, real country, optional region, map name, mode); **Import** Round Analyzer JSON                                       | (new, same style)                       |
| `/blocks`             | Training blocks: current block progress, start a new block (length, minutes/day, targets suggested from weak spots), finished-block comparison (before vs after)                                                                 | (new)                                   |
| `/stats`              | Retention line (30 days), KPIs, top confusions                                                                                                                                                                                   | Stats                                   |
| `/settings`           | Daily caps, new/day, desired retention (default 0.9), block defaults (14 days × 20 min), formats trained (Moving/NM/NMPZ), extension pairing code, account (cloud mode)                                                          | (new)                                   |
| `/editor`             | Card + tip editor: list/filter, create/edit, validates required source URL; in local mode edits are stored as overrides                                                                                                          | (new)                                   |
| `/placement/:country` | Placement test                                                                                                                                                                                                                   | (new)                                   |
| `/login`              | Cloud mode only: email magic link                                                                                                                                                                                                | (new)                                   |

## 6. Training blocks

1. **Sync (baseline):** snapshot from game data (rounds) + drill accuracy: per-country accuracy, avg distance, top confusions.
2. **Plan:** default 14 days × 20 min (7–30 days, 10–60 min). Targets = top weak countries/pairs. Suggest maps to play ("play a Balkans map 3× this week").
3. **Practise:** Today weights block targets to ≈ 40% of the session; daily progress shown.
4. **Compare:** at the end, re-snapshot and show before/after per target; suggest next block. Missed days don't break a block; a block can end early.

Tables: `training_blocks(user_id, starts_on, ends_on, minutes_per_day, targets jsonb, baseline jsonb, final jsonb, status)`, `block_days(block_id, day, minutes_done, cards_done)`.

## 7. Game data

Three sources, all normalised to:

```
Round { id, source: 'extension'|'import'|'manual', playedAt, map?, mode?: 'move'|'nm'|'nmpz',
        truth: { lat?, lon?, country, region? }, guess: { lat?, lon?, country, region? },
        distanceKm?, score? }
```

- Rounds where `guess.country !== truth.country` upsert a confusion and pull the truth country's cards forward (set due = now for up to 5 of its weakest cards).
- **Import:** GeoGuessr Round Analyzer userscript JSON export (array of rounds; parse defensively, unknown shape → clear error). Country derived from provided country codes if present, else reverse-geocode against a bundled coarse country lookup is out of scope: require country codes or skip with a count of skipped rounds.
- **Extension:** see §9.

## 8. Data layer

`apps/web/src/data/` exposes one `Repository` interface (cards/tips read from bundled content + overrides; card_state, reviews, confusions, tip_views, rounds, training_blocks, block_days, settings, pairing). Two implementations: `LocalRepository` (IndexedDB via `idb`) and `SupabaseRepository`. Chosen at startup by env vars.

Supabase tables (all with RLS `user_id = auth.uid()`): `card_state, reviews, confusions, tip_views, rounds, training_blocks, block_days, settings, card_overrides, pool_countries (read-only to users), extension_tokens`. Edge function `ingest-rounds` accepts rounds from the extension authenticated by a pairing token (hashed in `extension_tokens`), rate-limited, and checks a global `capture_enabled` flag (kill switch) in an `app_flags` table.

## 9. Extension (apps/extension, prototype — do not publish)

- Manifest V3, built with WXT. `content_scripts.matches` = `https://www.geoguessr.com/game/*` only. Runtime check: if `location.pathname` doesn't start with `/game/`, do nothing and disconnect observers (SPA navigation).
- Isolated-world content script only. **No** `web_accessible_resources`, **no** page-world injection, **no** patching fetch/XHR/WebSocket, **no** DOM writes, styles or UI on GeoGuessr.
- Reads only after a round result is shown (MutationObserver on the result screen), from the DOM. Parser lives in one file with selectors isolated and documented as _unverified_ until tested on the real site. If parsing fails: stop silently and report status to Metabook (no retries, no probing).
- Sends rounds to `ingest-rounds` with the pairing token from the popup. Checks the kill-switch flag before sending.
- Popup: pair with code, status (last capture, enabled/disabled). That popup is the only UI.

## 10. Content (content/)

- `pool.json`: competitive pool countries (ISO2, name, continent, in_pool) — editable, not hard-coded in logic.
- `cards/*.json`, `tips/*.json`: flags (true aspect ratios), scripts, lookalike pairs, Brazil regions + area codes (all DDDs) + meta cards. Every card and tip has a `source` URL.
- `maps/br-states.json`: already provided — simplified real borders, label positions and capital coords for Brazil (viewBox 0 0 640 580; small states need callout labels: RN, PB, PE, AL, SE, ES, RJ, DF — see AreaCode mockup).
