-- 003_user_settings.sql

create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  currency text not null default 'TJS',
  biometric_enabled boolean not null default false,
  pin_hash text,
  notification_enabled boolean not null default true,
  push_enabled boolean not null default true,
  offline_sync_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.user_settings.pin_hash is
  'Argon2/bcrypt hash of the in-app PIN. The raw PIN is NEVER sent to or stored on the server unhashed.';

-- Auto-create settings row alongside the profile row.
create or replace function public.handle_new_profile_settings()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_profile_created_settings
  after insert on public.profiles
  for each row execute function public.handle_new_profile_settings();
