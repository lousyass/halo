-- Migration: 20261028000000_create_lifestyle_habits_and_goals.sql
-- Description: Halo Lifestyle Mode Phase 1 tables (goals, habits, habit_schedules, habit_items, habit_completions, habit_pauses) with strict RLS and parent validation

-- 1. goals
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  target_count integer check (target_count is null or target_count > 0),
  deadline date,
  start_date date not null,
  achieved_on date,
  archived_on date,
  created_at timestamptz not null default now()
);

alter table public.goals enable row level security;

create policy "select own" on public.goals
  for select using (auth.uid() = user_id);

create policy "insert own" on public.goals
  for insert with check (auth.uid() = user_id);

create policy "update own" on public.goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "delete own" on public.goals
  for delete using (auth.uid() = user_id);

create index if not exists goals_user_id_idx on public.goals (user_id);


-- 2. habits
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text,
  color text,
  icon text,
  goal_id uuid references public.goals(id) on delete set null,
  start_date date not null,
  archived_on date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.habits enable row level security;

create policy "select own" on public.habits
  for select using (auth.uid() = user_id);

create policy "insert own" on public.habits
  for insert with check (
    auth.uid() = user_id
    and (goal_id is null or exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()))
  );

create policy "update own" on public.habits
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (goal_id is null or exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()))
  );

create policy "delete own" on public.habits
  for delete using (auth.uid() = user_id);

create index if not exists habits_user_id_idx on public.habits (user_id);
create index if not exists habits_goal_id_idx on public.habits (goal_id);


-- 3. habit_schedules
create table if not exists public.habit_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  effective_from date not null,
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  unique (habit_id, effective_from)
);

alter table public.habit_schedules enable row level security;

create policy "select own" on public.habit_schedules
  for select using (auth.uid() = user_id);

create policy "insert own" on public.habit_schedules
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );

create policy "update own" on public.habit_schedules
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );

create policy "delete own" on public.habit_schedules
  for delete using (auth.uid() = user_id);

create index if not exists habit_schedules_habit_id_idx on public.habit_schedules (habit_id);


-- 4. habit_items
create table if not exists public.habit_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  title text not null,
  weekdays smallint[] check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[])),
  start_date date not null,
  archived_on date,
  sort_order integer not null default 0
);

alter table public.habit_items enable row level security;

create policy "select own" on public.habit_items
  for select using (auth.uid() = user_id);

create policy "insert own" on public.habit_items
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );

create policy "update own" on public.habit_items
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );

create policy "delete own" on public.habit_items
  for delete using (auth.uid() = user_id);

create index if not exists habit_items_habit_id_idx on public.habit_items (habit_id);


-- 5. habit_completions
create table if not exists public.habit_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  item_id uuid references public.habit_items(id) on delete cascade,
  log_date date not null,
  status text not null check (status in ('done', 'skipped')),
  created_at timestamptz not null default now(),
  check (status = 'done' or item_id is null)
);

create unique index if not exists habit_completions_habit_date_idx on public.habit_completions (habit_id, log_date) where item_id is null;
create unique index if not exists habit_completions_item_date_idx on public.habit_completions (item_id, log_date) where item_id is not null;
create index if not exists habit_completions_user_log_date_idx on public.habit_completions (user_id, log_date);

alter table public.habit_completions enable row level security;

create policy "select own" on public.habit_completions
  for select using (auth.uid() = user_id);

create policy "insert own" on public.habit_completions
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
    and (item_id is null or exists (select 1 from public.habit_items i where i.id = item_id and i.user_id = auth.uid()))
  );

create policy "update own" on public.habit_completions
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
    and (item_id is null or exists (select 1 from public.habit_items i where i.id = item_id and i.user_id = auth.uid()))
  );

create policy "delete own" on public.habit_completions
  for delete using (auth.uid() = user_id);


-- 6. habit_pauses
create table if not exists public.habit_pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date)
);

alter table public.habit_pauses enable row level security;

create policy "select own" on public.habit_pauses
  for select using (auth.uid() = user_id);

create policy "insert own" on public.habit_pauses
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );

create policy "update own" on public.habit_pauses
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );

create policy "delete own" on public.habit_pauses
  for delete using (auth.uid() = user_id);

create index if not exists habit_pauses_habit_id_idx on public.habit_pauses (habit_id);
