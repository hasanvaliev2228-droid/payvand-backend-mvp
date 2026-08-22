-- 009_calendar_health.sql

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  event_type text not null check (event_type in ('task', 'reminder', 'payment', 'health', 'other')),
  start_at timestamptz not null,
  end_at timestamptz,
  reminder_minutes integer check (reminder_minutes >= 0),
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_end_after_start check (end_at is null or end_at >= start_at)
);

create index calendar_events_user_id_idx on public.calendar_events(user_id, start_at);

create table public.health_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  record_type text not null check (record_type in ('weight', 'blood_pressure', 'medicine', 'note')),
  value numeric(10, 2),
  unit text,
  systolic integer,
  diastolic integer,
  recorded_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  constraint health_records_bp_fields check (
    record_type <> 'blood_pressure' or (systolic is not null and diastolic is not null)
  )
);

create index health_records_user_id_idx on public.health_records(user_id, recorded_at desc);
