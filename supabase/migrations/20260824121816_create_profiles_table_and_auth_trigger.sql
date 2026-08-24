-- Create profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'Asia/Manila',
  reminder_mode text not null default 'urgent'
    check (reminder_mode in ('urgent', 'daily')),
  daily_digest_time time not null default '08:00',
  preferences jsonb default '{}',
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- RLS policies (uses id, not user_id)
create policy "select own rows" on public.profiles
  for select using (auth.uid() = id);

create policy "insert own rows" on public.profiles
  for insert with check (auth.uid() = id);

create policy "update own rows" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "delete own rows" on public.profiles
  for delete using (auth.uid() = id);

-- Trigger function to auto-create profile on auth.users insert
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

-- Trigger on auth.users insert
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
