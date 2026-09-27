-- XIME BINGO — PRODUCTION SUPABASE SCHEMA
-- Run this entire file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  roll_number text not null,
  section text not null check (section in ('A','B','C','D')),
  created_at timestamptz not null default now()
);

create unique index if not exists participants_roll_number_unique
on public.participants (lower(roll_number));

create table if not exists public.bingo_tasks (
  id bigint primary key,
  task_text text not null,
  sort_order int not null unique
);

create table if not exists public.completions (
  id bigint generated always as identity primary key,
  participant_id uuid not null references public.participants(id) on delete cascade,
  task_id bigint not null references public.bingo_tasks(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique(participant_id, task_id)
);

-- Replace these 25 tasks with your final event challenges.
insert into public.bingo_tasks(id,task_text,sort_order) values
(1,'Find someone from another section',1),
(2,'Take a photo with your oldest batchmate',2),
(3,'Get a signature from a faculty member',3),
(4,'Find someone who has the same birth month',4),
(5,'Compliment someone’s presentation style',5),
(6,'Meet someone from another state',6),
(7,'Find someone who speaks 3+ languages',7),
(8,'Take a group selfie with 4 people',8),
(9,'Find someone wearing XIME merch',9),
(10,'Ask someone their dream company',10),
(11,'Find a classmate with the same first initial',11),
(12,'Exchange one useful career tip',12),
(13,'Find someone who has travelled abroad',13),
(14,'Get a recommendation for a campus food spot',14),
(15,'Find someone from a different UG background',15),
(16,'Learn one new Malayalam word from a friend',16),
(17,'Find someone who plays a musical instrument',17),
(18,'Ask someone their hidden talent',18),
(19,'Find someone who has completed an internship',19),
(20,'Find a classmate with the same favourite sport',20),
(21,'Make someone laugh',21),
(22,'Find someone who joined XIME from another state',22),
(23,'Ask someone for their best study hack',23),
(24,'Take a photo recreating a movie pose',24),
(25,'Complete a task with a person you just met',25)
on conflict(id) do update set task_text=excluded.task_text,sort_order=excluded.sort_order;

alter table public.bingo_tasks enable row level security;
alter table public.participants enable row level security;
alter table public.completions enable row level security;

-- Public students can see only the task list.
drop policy if exists "tasks_public_read" on public.bingo_tasks;
create policy "tasks_public_read" on public.bingo_tasks for select to anon,authenticated using (true);

-- Students can register. We deliberately do NOT allow public reads of participants.
drop policy if exists "participants_public_insert" on public.participants;
create policy "participants_public_insert" on public.participants for insert to anon,authenticated with check (true);

-- Create an admin allow-list. Add the UUID of your Supabase admin user after
-- creating the user in Authentication > Users.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(select 1 from public.admins where user_id=auth.uid());
$$;

-- Authenticated admins can see participant records.
drop policy if exists "admins_read_participants" on public.participants;
create policy "admins_read_participants" on public.participants for select to authenticated using (public.is_admin());

-- A participant may insert a completion only for a participant row.
-- The UUID is created server-side and is not exposed as a human credential.
drop policy if exists "public_insert_completions" on public.completions;
create policy "public_insert_completions" on public.completions for insert to anon,authenticated with check (
  exists(select 1 from public.participants p where p.id=participant_id)
);

-- Only admins can read the completion table.
drop policy if exists "admins_read_completions" on public.completions;
create policy "admins_read_completions" on public.completions for select to authenticated using (public.is_admin());

-- Admins can also update/delete records if the event team needs corrections.
drop policy if exists "admins_update_completions" on public.completions;
create policy "admins_update_completions" on public.completions for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins_delete_completions" on public.completions;
create policy "admins_delete_completions" on public.completions for delete to authenticated using (public.is_admin());

-- Realtime dashboard updates.
do $$
begin
  alter publication supabase_realtime add table public.completions;
exception when duplicate_object then null;
end $$;

-- IMPORTANT AFTER CREATING THE ADMIN USER:
-- insert into public.admins(user_id)
-- values ('PASTE_AUTH_USER_UUID_HERE');
