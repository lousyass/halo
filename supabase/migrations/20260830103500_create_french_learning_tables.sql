-- Migration: Create French Learning tables (Le Coin Français)

-- 1. learning_units table (The Journey / ordered units)
create table public.learning_units (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  description text,
  order_index integer not null,
  icon        text,
  created_at  timestamptz not null default now()
);

create index idx_learning_units_user on public.learning_units(user_id, order_index);

alter table public.learning_units enable row level security;

create policy "select own rows" on public.learning_units
  for select using (auth.uid() = user_id);

create policy "insert own rows" on public.learning_units
  for insert with check (auth.uid() = user_id);

create policy "update own rows" on public.learning_units
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own rows" on public.learning_units
  for delete using (auth.uid() = user_id);


-- 2. learning_cards table (Core Vocabulary Deck & Spaced Repetition)
create table public.learning_cards (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  french           text not null,
  english          text not null,
  example_sentence text,
  tag              text,
  unit_id          uuid references public.learning_units(id) on delete set null,
  source           text not null default 'manual'
                     check (source in ('manual', 'daily_suggestion', 'dictionary_star')),
  interval_days    integer not null default 1,
  ease_factor      real not null default 2.5,
  next_review_date date not null default current_date,
  created_at       timestamptz not null default now()
);

create index idx_learning_cards_review on public.learning_cards(user_id, next_review_date);
create index idx_learning_cards_unit on public.learning_cards(user_id, unit_id);

alter table public.learning_cards enable row level security;

create policy "select own rows" on public.learning_cards
  for select using (auth.uid() = user_id);

create policy "insert own rows" on public.learning_cards
  for insert with check (auth.uid() = user_id);

create policy "update own rows" on public.learning_cards
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own rows" on public.learning_cards
  for delete using (auth.uid() = user_id);


-- 3. learning_notes table (Personal French Grammar / Rules / Notes)
create table public.learning_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  content    text not null,
  unit_id    uuid references public.learning_units(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_learning_notes_user on public.learning_notes(user_id);

alter table public.learning_notes enable row level security;

create policy "select own rows" on public.learning_notes
  for select using (auth.uid() = user_id);

create policy "insert own rows" on public.learning_notes
  for insert with check (auth.uid() = user_id);

create policy "update own rows" on public.learning_notes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own rows" on public.learning_notes
  for delete using (auth.uid() = user_id);


-- 4. learning_words_shown table (Tracks shown daily words to avoid repetition)
create table public.learning_words_shown (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  french_word text not null,
  shown_at    timestamptz not null default now(),
  constraint uq_learning_words_shown unique (user_id, french_word)
);

create index idx_learning_words_shown_user on public.learning_words_shown(user_id);

alter table public.learning_words_shown enable row level security;

create policy "select own rows" on public.learning_words_shown
  for select using (auth.uid() = user_id);

create policy "insert own rows" on public.learning_words_shown
  for insert with check (auth.uid() = user_id);

create policy "update own rows" on public.learning_words_shown
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own rows" on public.learning_words_shown
  for delete using (auth.uid() = user_id);


-- 5. learning_resources table (Curated Resource Library per user)
create table public.learning_resources (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  title              text not null,
  url                text,
  resource_type      text not null
                       check (resource_type in ('app','website','youtube','podcast','book','music','film_tv','audiobook','article','browser_extension','other')),
  section            text not null
                       check (section in ('core_course','extras','watch','listen_music','listen_podcast','listen_audiobook','read','inspiration')),
  level              text
                       check (level in ('all','absolute_beginner','a1_a2','a2_b1','b1_b2','b2_c1') or level is null),
  skills             text,
  notes              text,
  recommended        boolean not null default false,
  her_favorite       boolean not null default false,
  source_attribution text,
  created_at         timestamptz not null default now()
);

create index idx_learning_resources_user on public.learning_resources(user_id, section);

alter table public.learning_resources enable row level security;

create policy "select own rows" on public.learning_resources
  for select using (auth.uid() = user_id);

create policy "insert own rows" on public.learning_resources
  for insert with check (auth.uid() = user_id);

create policy "update own rows" on public.learning_resources
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own rows" on public.learning_resources
  for delete using (auth.uid() = user_id);
