-- v1.4: agent review. Vision agents look at every pending candidate and propose its uses: crops,
-- each tagged with a subject (one photo can give a sign crop and a guardrail crop). The review job
-- (service role) inserts them as 'suggested'; admins approve, reject or adjust them at /curate
-- (By topic); the collect job turns approved uses into their own MediaItems.

create table if not exists media_uses (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references media_candidates on delete cascade,
  subject text not null,
  -- {x, y, w, h}: fractions 0..1 of the candidate image, as media_candidates.crop
  crop jsonb not null,
  -- the agent's note; becomes the caption unless it names the country
  note text,
  status text not null default 'suggested' check (status in ('suggested', 'approved', 'rejected')),
  decided_at timestamptz,
  collected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (candidate_id, subject, crop)
);
create index if not exists media_uses_status_idx on media_uses (status, subject);
alter table media_uses enable row level security;

-- admins may read and decide; nobody else may do anything (inserts come from the service role)
drop policy if exists admin_select on media_uses;
create policy admin_select on media_uses for select to authenticated
  using (exists (select 1 from app_admins where user_id = auth.uid()));
drop policy if exists admin_update on media_uses;
create policy admin_update on media_uses for update to authenticated
  using (exists (select 1 from app_admins where user_id = auth.uid()))
  with check (exists (select 1 from app_admins where user_id = auth.uid()));

-- admins may change only the decision, the crop and the subject
revoke insert, update, delete on media_uses from anon, authenticated;
grant select on media_uses to authenticated;
grant update (status, crop, subject, decided_at) on media_uses to authenticated;

-- 'reviewed': the agents processed the candidate and its uses carry the decision. The check
-- constraint was created inline in 0003 (generated name), so look it up instead of guessing.
do $$
declare
  name text;
begin
  for name in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.media_candidates'::regclass
      and con.contype = 'c'
      and att.attname = 'status'
  loop
    execute format('alter table public.media_candidates drop constraint %I', name);
  end loop;
end
$$;
alter table media_candidates add constraint media_candidates_status_check
  check (status in ('pending', 'reviewed', 'approved', 'rejected'));
