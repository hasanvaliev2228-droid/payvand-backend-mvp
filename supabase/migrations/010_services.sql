-- 010_services.sql

create table public.service_providers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  category text not null,
  phone text,
  address text,
  latitude double precision,
  longitude double precision,
  description text,
  rating numeric(2, 1) check (rating >= 0 and rating <= 5),
  status text not null default 'pending' check (status in ('pending', 'active', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index service_providers_status_idx on public.service_providers(status);
create index service_providers_category_idx on public.service_providers(category);
