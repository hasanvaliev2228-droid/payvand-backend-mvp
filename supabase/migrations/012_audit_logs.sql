-- 012_audit_logs.sql
-- offline_sync_events and audit_logs.

create table public.offline_sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_event_id text not null unique,
  entity_type text not null,
  entity_id uuid,
  operation text not null check (operation in ('create', 'update', 'delete')),
  payload jsonb not null,
  client_created_at timestamptz not null,
  server_processed_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'processed', 'conflict', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index offline_sync_events_user_id_idx on public.offline_sync_events(user_id, created_at desc);
create index offline_sync_events_status_idx on public.offline_sync_events(status);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index audit_logs_actor_id_idx on public.audit_logs(actor_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
