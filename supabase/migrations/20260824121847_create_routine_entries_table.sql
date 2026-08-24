-- Create routine_entries table
create table public.routine_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_of_week smallint not null
    check (day_of_week between 0 and 6),
  subject text not null,
  start_time time not null,
  end_time time,
  location text,
  notes text
);

-- Index
create index idx_routine_entries_user_day on public.routine_entries (user_id, day_of_week);

-- Enable RLS
alter table public.routine_entries enable row level security;

-- RLS policies
create policy "select own rows" on public.routine_entries
  for select using (auth.uid() = user_id);

create policy "insert own rows" on public.routine_entries
  for insert with check (auth.uid() = user_id);

create policy "update own rows" on public.routine_entries
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own rows" on public.routine_entries
  for delete using (auth.uid() = user_id);
