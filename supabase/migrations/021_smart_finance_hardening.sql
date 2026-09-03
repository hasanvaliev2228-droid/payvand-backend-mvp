-- Additive Smart Finance hardening: budgets, server-only rate controls and receipt confirmation.
create table public.budgets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null, name text not null check (char_length(name) between 1 and 120),
  amount numeric(14,2) not null check (amount > 0), currency text not null default 'TJS' check (currency ~ '^[A-Z]{3}$'),
  period_start date not null, period_end date not null check (period_end >= period_start), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index budgets_user_period_idx on public.budgets(user_id, period_start, period_end);
create trigger set_updated_at before update on public.budgets for each row execute function public.set_updated_at();
alter table public.budgets enable row level security;
create policy budgets_owner_all on public.budgets for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.api_rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade, scope text not null,
  window_started_at timestamptz not null default now(), request_count integer not null default 0 check (request_count >= 0), primary key (user_id, scope)
);
alter table public.api_rate_limits enable row level security;
create or replace function public.consume_rate_limit(p_user_id uuid, p_scope text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_started timestamptz; v_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then raise exception 'invalid rate limit'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_scope, 0));
  select window_started_at, request_count into v_started, v_count from public.api_rate_limits where user_id = p_user_id and scope = p_scope;
  if not found then insert into public.api_rate_limits(user_id, scope, request_count) values (p_user_id, p_scope, 1); return true; end if;
  if v_started + make_interval(secs => p_window_seconds) <= now() then update public.api_rate_limits set window_started_at = now(), request_count = 1 where user_id = p_user_id and scope = p_scope; return true; end if;
  if v_count >= p_limit then return false; end if;
  update public.api_rate_limits set request_count = request_count + 1 where user_id = p_user_id and scope = p_scope; return true;
end;
$$;
revoke all on function public.consume_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, text, integer, integer) to service_role;

alter table public.document_scans add column transaction_id uuid references public.transactions(id) on delete set null;
create unique index document_scans_transaction_id_unique on public.document_scans(transaction_id) where transaction_id is not null;
