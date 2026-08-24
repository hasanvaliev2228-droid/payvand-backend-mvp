-- 016_notes.sql
-- Notes / digital notebook module. Follows the same shape as every other
-- user-owned table in this project (uuid pk, timestamptz, owner-scoped RLS,
-- set_updated_at trigger from 013_indexes_triggers.sql).

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content text,
  category text,
  is_private boolean not null default true,
  reminder_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notes is 'Personal notes / digital notebook. Always owned by exactly one user.';
comment on column public.notes.is_private is 'Reserved for future sharing features; every note is owner-only regardless of this flag today (see RLS policy notes_owner_all).';

create index notes_user_id_idx on public.notes(user_id);
create index notes_user_id_created_at_idx on public.notes(user_id, created_at desc);
create index notes_category_idx on public.notes(user_id, category);
create index notes_reminder_at_idx on public.notes(user_id, reminder_at) where reminder_at is not null;

-- updated_at auto-refresh, same trigger function as every other table
-- (public.set_updated_at, defined in 013_indexes_triggers.sql).
create trigger set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

-- ============================================================
-- RLS: a user can only ever see/edit/delete their OWN notes.
-- Same pattern as bank_cards_owner_all / documents_owner_all / etc. in
-- 014_rls_policies.sql.
-- ============================================================
alter table public.notes enable row level security;

create policy notes_owner_all on public.notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
