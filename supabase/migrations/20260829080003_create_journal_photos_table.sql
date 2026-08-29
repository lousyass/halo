create table public.journal_photos (
  id                  uuid primary key default gen_random_uuid(),
  journal_entry_id    uuid not null references public.journal_entries(id) on delete cascade,
  user_id             uuid not null references auth.users(id),
  image_url           text not null,
  original_drive_url  text,
  created_at          timestamptz not null default now()
);

create index idx_journal_photos_entry on public.journal_photos(journal_entry_id);
create index idx_journal_photos_user on public.journal_photos(user_id);

alter table public.journal_photos enable row level security;

create policy "select own rows" on public.journal_photos
  for select using (auth.uid() = user_id);

create policy "insert own rows" on public.journal_photos
  for insert with check (auth.uid() = user_id);

create policy "update own rows" on public.journal_photos
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own rows" on public.journal_photos
  for delete using (auth.uid() = user_id);
