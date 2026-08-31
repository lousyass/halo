-- Create entertainment_favorites table
create table if not exists public.entertainment_favorites (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  resource_id text not null,
  created_at timestamptz default now() not null,
  unique (user_id, resource_id)
);

-- Enable RLS
alter table public.entertainment_favorites enable row level security;

-- Create RLS policies
drop policy if exists "Users can view own entertainment favorites" on public.entertainment_favorites;
create policy "Users can view own entertainment favorites"
  on public.entertainment_favorites
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own entertainment favorites" on public.entertainment_favorites;
create policy "Users can insert own entertainment favorites"
  on public.entertainment_favorites
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own entertainment favorites" on public.entertainment_favorites;
create policy "Users can delete own entertainment favorites"
  on public.entertainment_favorites
  for delete
  using (auth.uid() = user_id);
