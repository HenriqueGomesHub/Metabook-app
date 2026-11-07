# Supabase setup (cloud mode)

Metabook runs without Supabase (local mode). Follow this only to enable accounts, sync and the extension. No Docker or local Supabase stack is needed.

1. **Create a project** at https://supabase.com/dashboard and note the project ref and database password.
2. **Apply the schema**, either:
   - SQL editor: paste `supabase/migrations/0001_init.sql` and run it, or
   - CLI: `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`.
3. **Seed the pool** (service role only): `node supabase/seed-pool.mjs > seed.sql`, then paste `seed.sql` into the SQL editor and run it.
4. **Enable email sign-in**: Authentication > Providers > Email (magic link). Add the app URL (and `http://localhost:5173` for development) under Authentication > URL Configuration > Redirect URLs.
5. **Deploy the edge function**: `npx supabase functions deploy ingest-rounds --no-verify-jwt` (the extension authenticates with its pairing token, not a user JWT). `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.
6. **Configure the web app**: copy `apps/web/.env.example` to `apps/web/.env.local` and set, from Project Settings > API:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = `anon` public key

   Leave both empty for local mode. Never put the service role key in the web app.

## Extension pairing

Settings > Extension calls `create_pairing_code()`, which returns a pairing token (shown once, replaces the previous one; revoke by creating a new one). It is a long-lived bearer token; only its SHA-256 hash is stored. The extension sends it as `x-metabook-token` to `https://<ref>.supabase.co/functions/v1/ingest-rounds`.

The extension must call the function from its background service worker (Origin `chrome-extension://...`), not from the content script, whose requests carry the page's origin and are rejected.

## Kill switch

Disable capture for everyone: `update app_flags set capture_enabled = false;` (SQL editor). The function then rejects all ingests.
