-- Add completed_at column to tasks
alter table public.tasks
  add column if not exists completed_at timestamptz;

-- Trigger: automatically set completed_at when completed flips to true, clear it when flipped back
create or replace function public.set_task_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.completed = true and (old.completed = false or old.completed is null) then
    new.completed_at = now();
  elsif new.completed = false then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_task_completed_at on public.tasks;
create trigger trg_set_task_completed_at
  before update on public.tasks
  for each row
  execute function public.set_task_completed_at();
