-- Remove check constraints on journal_entries.mood to allow free-text custom moods
do $$
declare
  r record;
begin
  for r in (
    select conname
    from pg_constraint
    where conrelid = 'public.journal_entries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%mood%'
  ) loop
    execute 'alter table public.journal_entries drop constraint if exists ' || quote_ident(r.conname);
  end loop;
end $$;

-- Ensure mood is text and nullable
alter table public.journal_entries alter column mood drop not null;
