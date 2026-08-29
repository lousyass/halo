create table public.journal_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id),
  entry_date   date not null,
  content      text not null,
  mood         text check (mood in ('great', 'good', 'okay', 'tough', 'rough')),
  is_pinned    boolean not null default false,
  created_at   timestamptz not null default now()
);

create index idx_journal_entries_user_date on public.journal_entries(user_id, entry_date);

alter table public.journal_entries enable row level security;

create policy "select own rows" on public.journal_entries
  for select using (auth.uid() = user_id);

create policy "insert own rows" on public.journal_entries
  for insert with check (auth.uid() = user_id);

create policy "update own rows" on public.journal_entries
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own rows" on public.journal_entries
  for delete using (auth.uid() = user_id);
