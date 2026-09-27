-- XIME BINGO FINAL DATABASE PATCH
-- Run this AFTER schema.sql, fix-rls.sql, and participant-login.sql.
--
-- This fixes the "Could not record that completion" problem.
-- The previous public INSERT policy checked the participants table under RLS.
-- Anonymous users cannot SELECT participants, so the EXISTS check could fail.
-- This security-definer function validates the participant server-side and
-- inserts the completion safely.

create or replace function public.record_completion(
  p_participant_id uuid,
  p_task_id bigint
)
returns text
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists (
    select 1
    from public.participants
    where id = p_participant_id
  ) then
    raise exception 'Participant not found';
  end if;

  if not exists (
    select 1
    from public.bingo_tasks
    where id = p_task_id
  ) then
    raise exception 'Task not found';
  end if;

  insert into public.completions(participant_id,task_id)
  values(p_participant_id,p_task_id)
  on conflict (participant_id,task_id) do nothing;

  return 'recorded';
end;
$$;

revoke all on function public.record_completion(uuid,bigint) from public;
grant execute on function public.record_completion(uuid,bigint) to anon,authenticated;

-- Remove the old anonymous direct-insert policy. The website now uses
-- record_completion() instead.
drop policy if exists "public_insert_completions" on public.completions;

-- Keep direct INSERT available only to authenticated admins if needed.
drop policy if exists "admins_insert_completions" on public.completions;
create policy "admins_insert_completions"
on public.completions
for insert
to authenticated
with check (public.is_admin());

(async function init(){
  try{await loadTasks();setStatus(true,"Live database");}catch(e){console.error(e);return}
  if(participant){try{show("game");await renderGame()}catch(e){console.error(e);show("home")}}
  else show("home");
})();
