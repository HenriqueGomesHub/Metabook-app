create table card_state (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id text not null,
  due timestamptz not null,
  stability double precision not null,
  difficulty double precision not null,
  elapsed_days integer not null,
  scheduled_days integer not null,
  reps integer not null,
  lapses integer not null,
  state text not null check (state in ('new', 'learning', 'review', 'relearning')),
  last_review timestamptz,
  learning_steps integer,
  primary key (user_id, card_id)
);
create index card_state_due_idx on card_state (user_id, due);

create table reviews (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  card_id text not null,
  grade text not null check (grade in ('again', 'hard', 'good', 'easy')),
  answer_given text not null,
  correct boolean not null,
  used_hint boolean not null,
  ms_taken integer not null,
  reviewed_at timestamptz not null,
  primary key (user_id, id)
);
create index reviews_reviewed_at_idx on reviews (user_id, reviewed_at);

create table confusions (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  picked text not null,
  truth text not null,
  count integer not null,
  last_seen timestamptz not null,
  contrast_streak integer not null,
  primary key (user_id, picked, truth)
);
create index confusions_last_seen_idx on confusions (user_id, last_seen);

create table tip_views (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tip_id text not null,
  last_shown timestamptz not null,
  primary key (user_id, tip_id)
);

create table rounds (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  source text not null check (source in ('extension', 'import', 'manual')),
  played_at timestamptz not null,
  map text,
  mode text check (mode in ('move', 'nm', 'nmpz')),
  truth jsonb not null,
  guess jsonb not null,
  distance_km double precision,
  score integer,
  primary key (user_id, id)
);
create index rounds_played_at_idx on rounds (user_id, played_at desc);

create table training_blocks (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  starts_on date not null,
  ends_on date not null,
  minutes_per_day integer not null,
  targets jsonb not null,
  baseline jsonb not null,
  final jsonb,
  status text not null check (status in ('active', 'finished', 'ended-early')),
  primary key (user_id, id)
);

create table block_days (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  block_id text not null,
  day date not null,
  minutes_done double precision not null,
  cards_done integer not null,
  primary key (user_id, block_id, day),
  foreign key (user_id, block_id) references training_blocks (user_id, id) on delete cascade
);

create table settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null
);

create table card_overrides (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  kind text not null check (kind in ('card', 'tip')),
  data jsonb not null,
  primary key (user_id, id)
);

create table pool_countries (
  code text primary key,
  name text not null,
  continent text not null check (continent in ('europe', 'asia', 'africa', 'americas', 'oceania')),
  in_pool boolean not null
);

create table app_flags (
  id boolean primary key default true check (id),
  capture_enabled boolean not null default true
);
insert into app_flags default values;

create table extension_tokens (
  token_hash text primary key,
  user_id uuid not null unique default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table card_state enable row level security;
alter table reviews enable row level security;
alter table confusions enable row level security;
alter table tip_views enable row level security;
alter table rounds enable row level security;
alter table training_blocks enable row level security;
alter table block_days enable row level security;
alter table settings enable row level security;
alter table card_overrides enable row level security;
alter table extension_tokens enable row level security;
alter table pool_countries enable row level security;
alter table app_flags enable row level security;

create policy own_rows on card_state for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on reviews for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on confusions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on tip_views for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on rounds for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on training_blocks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on block_days for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on card_overrides for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows_select on extension_tokens for select to authenticated
  using (user_id = auth.uid());
create policy own_rows_delete on extension_tokens for delete to authenticated
  using (user_id = auth.uid());
create policy read_all on pool_countries for select to authenticated using (true);
create policy read_all on app_flags for select to authenticated using (true);

create function create_pairing_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into extension_tokens (token_hash, user_id)
  values (encode(sha256(convert_to(token, 'UTF8')), 'hex'), auth.uid())
  on conflict (user_id) do update
    set token_hash = excluded.token_hash, created_at = now(), last_used_at = null;
  return token;
end;
$$;

revoke execute on function create_pairing_code() from public, anon;
grant execute on function create_pairing_code() to authenticated;
