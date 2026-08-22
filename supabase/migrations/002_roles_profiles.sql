-- 002_roles_profiles.sql
-- profiles: one row per auth.users row. Holds public profile + role.

create type public.app_language as enum ('tg', 'ru', 'en', 'zh');
create type public.app_role as enum ('user', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text unique,
  avatar_path text,
  language public.app_language not null default 'tg',
  city text,
  date_of_birth date,
  bio text,
  role public.app_role not null default 'user',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile data for each authenticated user. 1:1 with auth.users.';
comment on column public.profiles.role is 'Application role. Only elevated via service-role/admin action, never by the owning user.';

-- Auto-create a profile row whenever a new auth.users row is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
