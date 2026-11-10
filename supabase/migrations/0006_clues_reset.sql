-- 0006: start over on the clue catalogue (Plonk It + Learnable Meta).
-- Run once in the Supabase SQL editor. It cannot be undone.
--
-- Wipes: every photo candidate and suggested use, all study progress and card_overrides (they point at
-- card ids that no longer exist). Keeps: accounts, app_admins, settings, pool_countries, app_flags,
-- extension_tokens.
-- The files in the old public `media` bucket are removed by the `wipemedia` content job (Supabase
-- refuses direct deletes from storage tables), after which the bucket itself can be deleted in the
-- dashboard.

begin;

-- 1. Old photo pipeline
truncate table media_uses, media_candidates;

-- 2. Study progress tied to old card ids
truncate table reviews, card_state, confusions, tip_views, rounds, block_days, training_blocks, card_overrides;

-- 3. Private bucket for clue images: anyone signed in can read, only the service role key uploads
insert into storage.buckets (id, name, public)
values ('clues', 'clues', false)
on conflict (id) do update set public = false;

drop policy if exists clues_read on storage.objects;
create policy clues_read on storage.objects for select to authenticated
  using (bucket_id = 'clues');

-- 4. Your corrections to clue images (crop, hide), applied by the app on top of content/clues
create table if not exists clue_image_overrides (
  image_id text primary key,
  clue_id text not null,
  crop jsonb,
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users on delete set null
);

alter table clue_image_overrides enable row level security;

drop policy if exists read_all on clue_image_overrides;
create policy read_all on clue_image_overrides for select to authenticated using (true);

drop policy if exists admin_write on clue_image_overrides;
create policy admin_write on clue_image_overrides for all to authenticated
  using (exists (select 1 from app_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from app_admins a where a.user_id = auth.uid()));

-- 5. Spots you save from your own GeoGuessr rounds (extension) or by pasting a Google Maps link
create table if not exists saved_spots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  country text not null,
  clue_id text,
  pano text,
  lat double precision not null,
  lng double precision not null,
  heading double precision not null default 0,
  pitch double precision not null default 0,
  fov double precision not null default 75,
  note text,
  created_at timestamptz not null default now()
);

alter table saved_spots enable row level security;

drop policy if exists own_rows on saved_spots;
create policy own_rows on saved_spots for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

commit;
