-- Migration: 20261028010000_create_lifestyle_money_tables.sql
-- Description: Halo Lifestyle Mode Phase 2 tables (money_categories, money_transactions, money_budgets) with strict RLS and parent validation

-- 1. money_categories
create table if not exists public.money_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  color text,
  icon text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.money_categories enable row level security;

create policy "select own" on public.money_categories
  for select using (auth.uid() = user_id);

create policy "insert own" on public.money_categories
  for insert with check (auth.uid() = user_id);

create policy "update own" on public.money_categories
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own" on public.money_categories
  for delete using (auth.uid() = user_id);

create index if not exists money_categories_user_id_idx on public.money_categories (user_id);
create unique index if not exists money_categories_user_name_kind_uniq on public.money_categories (user_id, lower(name), kind);


-- 2. money_transactions
create table if not exists public.money_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('expense', 'income')),
  amount numeric(12,2) not null check (amount > 0),
  category_id uuid not null references public.money_categories(id) on delete restrict,
  txn_date date not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.money_transactions enable row level security;

create policy "select own" on public.money_transactions
  for select using (auth.uid() = user_id);

create policy "insert own" on public.money_transactions
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.money_categories c
      where c.id = category_id
        and c.user_id = auth.uid()
        and c.kind = type
    )
  );

create policy "update own" on public.money_transactions
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.money_categories c
      where c.id = category_id
        and c.user_id = auth.uid()
        and c.kind = type
    )
  );

create policy "delete own" on public.money_transactions
  for delete using (auth.uid() = user_id);

create index if not exists money_transactions_user_date_idx on public.money_transactions (user_id, txn_date);
create index if not exists money_transactions_user_category_idx on public.money_transactions (user_id, category_id);


-- 3. money_budgets
create table if not exists public.money_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_month date not null check (effective_month = date_trunc('month', effective_month)::date),
  category_id uuid references public.money_categories(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0)
);

alter table public.money_budgets enable row level security;

create policy "select own" on public.money_budgets
  for select using (auth.uid() = user_id);

create policy "insert own" on public.money_budgets
  for insert with check (
    auth.uid() = user_id
    and (
      category_id is null
      or exists (
        select 1 from public.money_categories c
        where c.id = category_id
          and c.user_id = auth.uid()
          and c.kind = 'expense'
      )
    )
  );

create policy "update own" on public.money_budgets
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      category_id is null
      or exists (
        select 1 from public.money_categories c
        where c.id = category_id
          and c.user_id = auth.uid()
          and c.kind = 'expense'
      )
    )
  );

create policy "delete own" on public.money_budgets
  for delete using (auth.uid() = user_id);

create unique index if not exists money_budgets_overall_uniq on public.money_budgets (user_id, effective_month) where category_id is null;
create unique index if not exists money_budgets_category_uniq on public.money_budgets (user_id, effective_month, category_id) where category_id is not null;
create index if not exists money_budgets_user_month_idx on public.money_budgets (user_id, effective_month);
