-- 006_loans.sql

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  borrower_name text not null,
  borrower_phone text,
  loan_type text not null check (loan_type in ('given', 'taken')),
  principal_amount numeric(14, 2) not null check (principal_amount > 0),
  interest_rate numeric(6, 3) not null default 0 check (interest_rate >= 0),
  total_payable numeric(14, 2) not null check (total_payable >= 0),
  start_date date not null,
  due_date date not null,
  payment_frequency text not null check (payment_frequency in ('once', 'weekly', 'monthly', 'quarterly')),
  status text not null default 'draft' check (status in ('draft', 'active', 'overdue', 'paid', 'cancelled')),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loans_due_after_start check (due_date >= start_date)
);

create index loans_owner_id_idx on public.loans(owner_id);
create index loans_status_idx on public.loans(status);

create table public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  payment_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index loan_payments_loan_id_idx on public.loan_payments(loan_id);
