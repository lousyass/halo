-- Create daily_digest_sent_log table
create table public.daily_digest_sent_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_for_date date not null,
  sent_at timestamptz default now(),
  unique (user_id, sent_for_date)
);

-- Enable RLS (no user-facing policies — service role only)
alter table public.daily_digest_sent_log enable row level security;
