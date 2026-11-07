# Metabook

A GeoGuessr training app: spaced-repetition drills (flags, scripts, metas, lookalike pairs, regions), country chapters, an area-code map game on real borders, training blocks, and game review fed by your own single-player games.

Product spec: [`docs/spec.md`](docs/spec.md) · Screen mockups: [`docs/mockups/`](docs/mockups)

## Run it (no keys needed)

Requires Node 22.

```bash
npm install
npm run dev          # http://localhost:5173
```

With no environment variables the app runs in **local mode**: no login, all progress stored in your browser (IndexedDB). Everything works except cross-device sync, friends' accounts and extension pairing.

## Cloud mode (accounts, sync, extension)

1. Set up a hosted Supabase project (no Docker needed): follow [`supabase/README.md`](supabase/README.md).
2. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Restart `npm run dev`. You'll be asked to sign in with an email magic link.

## Deploy the web app (Vercel)

- Import the repo in Vercel and set **Root Directory** to `apps/web`.
- Framework preset: Vite. Build command: `npm run build`. Output: `dist`.
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables (or leave them out for a local-mode deploy).
- Client-side routes already work on refresh via `apps/web/vercel.json`.
- Add the Vercel URL to Supabase → Authentication → URL Configuration → Redirect URLs.

## Companion extension (prototype)

`apps/extension` is an optional Chrome extension that records the results of your **single-player** games only. It never runs on competitive pages, writes nothing to the page and makes no requests to GeoGuessr. Its page selectors are **unverified** until tested on the live site, so read [`apps/extension/README.md`](apps/extension/README.md) before loading it, and test it on single-player games with your own account only.

## Content

All seed content in `content/` was written without web access and is marked `"verified": false`. Review it (especially the flags whose ratios are flagged in [`content/README.md`](content/README.md)) and use the in-app **Editor** or edit the JSON. `node content/validate.mjs` checks it.

## Workspace

| Path | What |
|---|---|
| `apps/web` | React + Vite PWA |
| `apps/extension` | Chrome MV3 companion extension (esbuild) |
| `packages/core` | Pure learning logic: FSRS, sessions, tips, medals, blocks |
| `content` | Seed cards, tips, country pool, Brazil map |
| `supabase` | Schema with RLS, `ingest-rounds` edge function |

Scripts from the repo root: `npm run dev`, `npm run build`, `npm test`, `npm run typecheck`, `npm run lint`.
