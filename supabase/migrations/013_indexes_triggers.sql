-- 013_indexes_triggers.sql
-- Generic updated_at trigger, applied to every table that has the column.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
  tables text[] := array[
    'profiles', 'user_settings', 'bank_cards', 'qr_codes', 'transactions',
    'loans', 'contacts', 'conversations', 'documents', 'calendar_events',
    'service_providers', 'device_tokens'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();',
      t
    );
  end loop;
end $$;

-- Additional composite / lookup indexes not already covered per-table.
create index if not exists profiles_phone_idx on public.profiles using btree (phone);
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists categories_name_trgm_idx on public.categories using gin (name gin_trgm_ops);
create index if not exists contacts_display_name_trgm_idx on public.contacts using gin (display_name gin_trgm_ops);
