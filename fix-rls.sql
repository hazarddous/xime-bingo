-- XIME BINGO: RLS/permissions patch
-- Run this AFTER the original schema.sql.
-- This fixes the registration error and supports current Supabase projects
-- where Data API grants may not be enabled automatically.

alter table public.participants enable row level security;
alter table public.bingo_tasks enable row level security;
alter table public.completions enable row level security;
alter table public.admins enable row level security;

-- Explicit Data API grants.
grant select on table public.bingo_tasks to anon, authenticated;
grant insert on table public.participants to anon, authenticated;
grant insert on table public.completions to anon, authenticated;
grant select, insert, update, delete on table public.participants to authenticated;
grant select, insert, update, delete on table public.completions to authenticated;

-- Remove conflicting participant INSERT policies.
drop policy if exists "participants_public_insert" on public.participants;
drop policy if exists "Allow public participant registration" on public.participants;

-- Public registration: anyone may create a participant row.
create policy "Allow public participant registration"
on public.participants
for insert
to anon, authenticated
with check (true);

-- Public users must NOT be able to read the participant table.
drop policy if exists "participants_public_select" on public.participants;

-- Only admins can read participants.
drop policy if exists "admins_read_participants" on public.participants;
create policy "admins_read_participants"
on public.participants
for select
to authenticated
using (public.is_admin());

-- Tasks are public.
drop policy if exists "tasks_public_read" on public.bingo_tasks;
create policy "tasks_public_read"
on public.bingo_tasks
for select
to anon, authenticated
using (true);

-- Public users can record a completion for an existing participant.
drop policy if exists "public_insert_completions" on public.completions;
create policy "public_insert_completions"
on public.completions
for insert
to anon, authenticated
with check (
  exists (
    select 1 from public.participants p
    where p.id = participant_id
  )
);

-- Only admins can read completions.
drop policy if exists "admins_read_completions" on public.completions;
create policy "admins_read_completions"
on public.completions
for select
to authenticated
using (public.is_admin());

-- Admin correction permissions.
drop policy if exists "admins_update_completions" on public.completions;
create policy "admins_update_completions"
on public.completions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins_delete_completions" on public.completions;
create policy "admins_delete_completions"
on public.completions
for delete
to authenticated
using (public.is_admin());

-- If the Realtime publication is available, add completions.
do $$
begin
  alter publication supabase_realtime add table public.completions;
exception when duplicate_object then null;
end $$;
