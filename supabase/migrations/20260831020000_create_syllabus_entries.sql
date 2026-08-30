-- Create syllabus_entries table
create table if not exists public.syllabus_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  subject text not null,
  title text not null,
  parent_entry_id uuid references public.syllabus_entries(id) on delete cascade,
  completed boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz default now() not null
);

-- Enable RLS
alter table public.syllabus_entries enable row level security;

-- Create RLS policies
drop policy if exists "Users can view own syllabus entries" on public.syllabus_entries;
create policy "Users can view own syllabus entries"
  on public.syllabus_entries
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own syllabus entries" on public.syllabus_entries;
create policy "Users can insert own syllabus entries"
  on public.syllabus_entries
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own syllabus entries" on public.syllabus_entries;
create policy "Users can update own syllabus entries"
  on public.syllabus_entries
  for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own syllabus entries" on public.syllabus_entries;
create policy "Users can delete own syllabus entries"
  on public.syllabus_entries
  for delete
  using (auth.uid() = user_id);
