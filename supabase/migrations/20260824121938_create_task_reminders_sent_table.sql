-- Create task_reminders_sent table
create table public.task_reminders_sent (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  threshold text not null
    check (threshold in ('48h', '24h', '2h', 'overdue')),
  sent_at timestamptz default now(),
  unique (task_id, threshold)
);

-- Enable RLS (no user-facing policies — service role only)
alter table public.task_reminders_sent enable row level security;
