-- Create game_favorites table
create table if not exists public.game_favorites (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  resource_id text not null,
  created_at timestamptz default now() not null,
  unique (user_id, resource_id)
);

-- Enable RLS
alter table public.game_favorites enable row level security;

-- Create RLS policies
drop policy if exists "Users can view own game favorites" on public.game_favorites;
create policy "Users can view own game favorites"
  on public.game_favorites
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own game favorites" on public.game_favorites;
create policy "Users can insert own game favorites"
  on public.game_favorites
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own game favorites" on public.game_favorites;
create policy "Users can update own game favorites"
  on public.game_favorites
  for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own game favorites" on public.game_favorites;
create policy "Users can delete own game favorites"
  on public.game_favorites
  for delete
  using (auth.uid() = user_id);
