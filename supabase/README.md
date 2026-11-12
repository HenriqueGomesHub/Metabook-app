# Supabase setup (cloud mode)

Metabook runs without Supabase (local mode). Follow this only to enable accounts, sync and the extension. No Docker or local Supabase stack is needed.

1. **Create a project** at https://supabase.com/dashboard and note the project ref and database password.
2. **Apply the schema**, either:
   - SQL editor: paste each file in `supabase/migrations/` in order (`0001_init.sql`, `0002_successes.sql`, then `0003_media.sql`) and run it, or
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

## Photo curation (0003_media.sql)

`0003_media.sql` adds the `media_candidates` queue, the `app_admins` table and a public Storage bucket `media`.

1. Run `0003_media.sql` in the SQL editor.
2. Sign in to the app once (so your user exists), then make yourself an admin, with your email:
   `insert into app_admins select id from auth.users where email = 'YOUR_EMAIL';`
3. GitHub repo secrets used by `.github/workflows/content.yml`: `SUPABASE_URL` (Project URL),
   `SUPABASE_SERVICE_ROLE_KEY` (service role key) and `MAPILLARY_TOKEN`. The service role key stays in
   GitHub; it is never given to the web app.

How it fits together: a content job (see `tools/content/README.md`) uploads photos to
`media/candidates/<code>/<id>.webp` and inserts `pending` rows. In cloud mode, admins get **Curate photos**
under Settings (`/curate`) to keep or reject them. A later job with the `collect` step moves kept photos to
`media/approved/<code>/<id>.webp`, writes `content/media/<code>.json`, and `generate` makes the cards.

Cards are bundled with the app (there is no `cardsVersion` or runtime card download): new cards reach
users when the branch is merged and Vercel deploys. Photos load from the public bucket at
`<VITE_SUPABASE_URL>/storage/v1/object/public/media/`; a local-mode deploy sets `VITE_MEDIA_BASE` to that
URL instead.

## Sign-in emails carry a code

The app signs in with the 6-digit code from the email, typed into the app. On an iPhone the
home-screen app keeps its own storage, so the email's link (which opens Safari) cannot sign it in.
Supabase only puts the code in the email if the template asks for it. In the dashboard, under
Authentication → Emails, edit both **Magic Link** and **Confirm signup** to include `{{ .Token }}`:

```html
<h2>Your Metabook code</h2>
<p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
<p>Type it in the app to sign in. Or <a href="{{ .ConfirmationURL }}">open this link</a> on this device.</p>
```
