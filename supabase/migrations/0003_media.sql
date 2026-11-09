-- v1.2: photo curation queue. The content workflow (service role, bypasses RLS) inserts candidates;
-- admins decide them in the app at /curate; approved ones are collected into content/media.

create table app_admins (
  user_id uuid primary key references auth.users on delete cascade
);
alter table app_admins enable row level security;
-- each user can see whether they are an admin (the app checks its own row); nobody can write
create policy own_row on app_admins for select to authenticated using (user_id = auth.uid());

create table media_candidates (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  subject text not null,
  region text,
  source text not null check (source in ('commons', 'mapillary')),
  source_url text not null unique,
  storage_path text not null,
  width integer,
  height integer,
  preview text,
  credit text not null,
  licence text not null,
  licence_url text,
  title text,
  lat double precision,
  lon double precision,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  giveaways text[] not null default '{}',
  note_id text,
  -- curator-only context (the Commons description); never shown to learners, often names the place
  description text,
  -- alt text shown to learners; written by the curator, must not name the country
  caption text,
  decided_at timestamptz,
  collected_at timestamptz,
  created_at timestamptz not null default now()
);
create index media_candidates_status_idx on media_candidates (status, country, subject);
alter table media_candidates enable row level security;

-- admins may read and decide; nobody else may do anything (no insert/delete policies at all)
create policy admin_select on media_candidates for select to authenticated
  using (exists (select 1 from app_admins where user_id = auth.uid()));
create policy admin_update on media_candidates for update to authenticated
  using (exists (select 1 from app_admins where user_id = auth.uid()))
  with check (exists (select 1 from app_admins where user_id = auth.uid()));

-- admins may change only what curation edits, not the photo, its credit or its licence
revoke update on media_candidates from authenticated;
grant update (status, subject, giveaways, caption, region, note_id, decided_at) on media_candidates to authenticated;

-- public bucket for candidate and approved photos; uploads only with the service role key
insert into storage.buckets (id, name, public) values ('media', 'media', true)
on conflict (id) do nothing;

-- make yourself an admin (replace the email, then run this line on its own):
-- insert into app_admins select id from auth.users where email = 'YOUR_EMAIL';
