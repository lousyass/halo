-- Create day_backgrounds table
create table public.day_backgrounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  image_url text not null,
  unique (user_id, date)
);

-- Enable RLS
alter table public.day_backgrounds enable row level security;

-- RLS policies
create policy "select own rows" on public.day_backgrounds
  for select using (auth.uid() = user_id);

create policy "insert own rows" on public.day_backgrounds
  for insert with check (auth.uid() = user_id);

create policy "update own rows" on public.day_backgrounds
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own rows" on public.day_backgrounds
  for delete using (auth.uid() = user_id);
