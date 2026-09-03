-- Smart Finance upgrade. This migration is additive: existing finance data and APIs remain unchanged.

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'TJS' check (currency ~ '^[A-Z]{3}$'),
  description text,
  status text not null default 'open' check (status in ('open','paid','cancelled','expired')),
  expires_at timestamptz,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, idempotency_key)
);
create index payment_requests_requester_status_idx on public.payment_requests(requester_id, status, created_at desc);
create trigger set_updated_at before update on public.payment_requests for each row execute function public.set_updated_at();

-- Short-lived replay guard for state-changing Edge Function requests. It stores only a hash of the
-- caller supplied key, never authentication tokens or payment credentials.
create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (char_length(scope) between 1 and 80),
  key_hash text not null check (char_length(key_hash) = 64),
  response_status integer,
  response_body jsonb,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  unique (user_id, scope, key_hash)
);
create index idempotency_keys_expiry_idx on public.idempotency_keys(expires_at);

-- Provider configuration is metadata only. Credentials live exclusively in Edge Function secrets.
create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('barcode_lookup','openai','google_vision','bank_open_banking')),
  status text not null default 'not_configured' check (status in ('not_configured','active','disabled','error')),
  external_account_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, provider)
);
create trigger set_updated_at before update on public.provider_connections for each row execute function public.set_updated_at();

create table public.finance_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  health_score smallint check (health_score between 0 and 100),
  summary jsonb not null default '{}'::jsonb,
  provider text not null default 'deterministic',
  created_at timestamptz not null default now(),
  unique(user_id, period_start, period_end, provider)
);
create index finance_insights_user_period_idx on public.finance_insights(user_id, period_end desc);

alter table public.payment_requests enable row level security;
create policy payment_requests_owner_all on public.payment_requests
  for all using (requester_id = auth.uid()) with check (requester_id = auth.uid());
alter table public.idempotency_keys enable row level security;
-- Access is Edge-Function/service-role only; no client policy is deliberate.
alter table public.provider_connections enable row level security;
create policy provider_connections_owner_all on public.provider_connections
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
alter table public.finance_insights enable row level security;
create policy finance_insights_owner_all on public.finance_insights
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
