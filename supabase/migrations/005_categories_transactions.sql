-- 005_categories_transactions.sql

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  icon text,
  color text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  -- system categories have user_id null; user categories must belong to someone
  constraint categories_owner_check check (
    (is_system = true and user_id is null) or (is_system = false and user_id is not null)
  )
);

create index categories_user_id_idx on public.categories(user_id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  type text not null check (type in ('income', 'expense', 'transfer')),
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'TJS',
  title text not null,
  note text,
  transaction_date timestamptz not null default now(),
  attachment_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_user_id_idx on public.transactions(user_id);
create index transactions_user_date_idx on public.transactions(user_id, transaction_date desc);
create index transactions_category_id_idx on public.transactions(category_id);
