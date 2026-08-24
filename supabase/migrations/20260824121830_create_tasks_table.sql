-- Create tasks table
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  type text not null,
  title text not null,
  due_date date not null,
  due_time time,
  completed boolean default false,
  custom_color text,
  custom_icon text,
  created_at timestamptz default now()
);

-- Indexes
create index idx_tasks_user_due_date on public.tasks (user_id, due_date);
create index idx_tasks_user_completed on public.tasks (user_id, completed);
create index idx_tasks_user_subject on public.tasks (user_id, subject);
create index idx_tasks_user_type on public.tasks (user_id, type);

-- Enable RLS
alter table public.tasks enable row level security;

-- RLS policies
create policy "select own rows" on public.tasks
  for select using (auth.uid() = user_id);

create policy "insert own rows" on public.tasks
  for insert with check (auth.uid() = user_id);

create policy "update own rows" on public.tasks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own rows" on public.tasks
  for delete using (auth.uid() = user_id);
