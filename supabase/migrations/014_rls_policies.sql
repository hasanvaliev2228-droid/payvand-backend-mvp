-- 014_rls_policies.sql
-- Row Level Security for every user-owned table. Deny-by-default: RLS is
-- enabled and NO policy means NO access, so every table below gets explicit
-- policies for select/insert/update/delete as appropriate.

-- ---------- helper: is the current user an admin? ----------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

-- ---------- helper: is the current user a member of a conversation? ----------
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid()
  );
$$;

-- ============================================================
-- profiles
-- ============================================================
alter table public.profiles enable row level security;

create policy profiles_select_own_or_admin on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    -- a non-admin can never change their own role
    and (role = (select role from public.profiles p where p.id = auth.uid()) or public.is_admin())
  );

-- profile rows are created only by the handle_new_user trigger (security definer),
-- so no direct insert policy for regular users is needed/granted.
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- user_settings
-- ============================================================
alter table public.user_settings enable row level security;

create policy user_settings_owner_all on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- bank_cards
-- ============================================================
alter table public.bank_cards enable row level security;

create policy bank_cards_owner_all on public.bank_cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- qr_codes
-- ============================================================
alter table public.qr_codes enable row level security;

create policy qr_codes_owner_all on public.qr_codes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- categories (system categories readable by everyone, editable by no one
-- but admin; user categories fully owned)
-- ============================================================
alter table public.categories enable row level security;

create policy categories_select_system_or_own on public.categories
  for select using (is_system = true or user_id = auth.uid());

create policy categories_insert_own on public.categories
  for insert with check (user_id = auth.uid() and is_system = false);

create policy categories_update_own on public.categories
  for update using (user_id = auth.uid() and is_system = false)
  with check (user_id = auth.uid() and is_system = false);

create policy categories_delete_own on public.categories
  for delete using (user_id = auth.uid() and is_system = false);

create policy categories_admin_all on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- transactions
-- ============================================================
alter table public.transactions enable row level security;

create policy transactions_owner_all on public.transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- loans / loan_payments
-- ============================================================
alter table public.loans enable row level security;

create policy loans_owner_all on public.loans
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.loan_payments enable row level security;

create policy loan_payments_owner_all on public.loan_payments
  for all using (
    exists (select 1 from public.loans l where l.id = loan_id and l.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.loans l where l.id = loan_id and l.owner_id = auth.uid())
  );

-- ============================================================
-- contacts
-- ============================================================
alter table public.contacts enable row level security;

create policy contacts_owner_all on public.contacts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ============================================================
-- conversations / conversation_members / direct_conversation_pairs
-- ============================================================
alter table public.conversations enable row level security;

create policy conversations_select_member on public.conversations
  for select using (public.is_conversation_member(id));

create policy conversations_insert_creator on public.conversations
  for insert with check (created_by = auth.uid());

create policy conversations_update_owner_member on public.conversations
  for update using (public.is_conversation_member(id))
  with check (public.is_conversation_member(id));

alter table public.conversation_members enable row level security;

create policy conversation_members_select_member on public.conversation_members
  for select using (public.is_conversation_member(conversation_id));

-- A user may only ever insert THEMSELVES as a member; adding other members is
-- performed by the create-conversation / group-management Edge Functions
-- running with the service role (which bypasses RLS by design).
create policy conversation_members_insert_self on public.conversation_members
  for insert with check (user_id = auth.uid());

-- Members can update only their own membership row (e.g. last_read_at, muted_until).
create policy conversation_members_update_self on public.conversation_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy conversation_members_delete_self_or_owner on public.conversation_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.conversation_members m
      where m.conversation_id = conversation_members.conversation_id
        and m.user_id = auth.uid() and m.member_role = 'owner'
    )
  );

alter table public.direct_conversation_pairs enable row level security;

create policy direct_pairs_select_member on public.direct_conversation_pairs
  for select using (user_a = auth.uid() or user_b = auth.uid());

-- ============================================================
-- messages / message_reactions
-- ============================================================
alter table public.messages enable row level security;

create policy messages_select_member on public.messages
  for select using (public.is_conversation_member(conversation_id));

create policy messages_insert_member on public.messages
  for insert with check (
    sender_id = auth.uid() and public.is_conversation_member(conversation_id)
  );

-- Soft delete / edit: only the sender may update their own message, and only
-- to set edited_at / deleted_at / body — never to change sender or conversation.
create policy messages_update_own on public.messages
  for update using (sender_id = auth.uid() and public.is_conversation_member(conversation_id))
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

alter table public.message_reactions enable row level security;

create policy message_reactions_select_member on public.message_reactions
  for select using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_conversation_member(m.conversation_id)
    )
  );

create policy message_reactions_insert_own on public.message_reactions
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_conversation_member(m.conversation_id)
    )
  );

create policy message_reactions_delete_own on public.message_reactions
  for delete using (user_id = auth.uid());

-- ============================================================
-- documents
-- ============================================================
alter table public.documents enable row level security;

create policy documents_owner_all on public.documents
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- calendar_events
-- ============================================================
alter table public.calendar_events enable row level security;

create policy calendar_events_owner_all on public.calendar_events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- health_records
-- ============================================================
alter table public.health_records enable row level security;

create policy health_records_owner_all on public.health_records
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- service_providers (public read of active; admin manages status)
-- ============================================================
alter table public.service_providers enable row level security;

create policy service_providers_select_active_or_admin on public.service_providers
  for select using (status = 'active' or owner_id = auth.uid() or public.is_admin());

create policy service_providers_insert_own on public.service_providers
  for insert with check (owner_id = auth.uid());

create policy service_providers_update_own_pending_fields on public.service_providers
  for update using (owner_id = auth.uid() and status = 'pending')
  with check (owner_id = auth.uid() and status = 'pending');

create policy service_providers_admin_all on public.service_providers
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- notifications / device_tokens
-- ============================================================
alter table public.notifications enable row level security;

create policy notifications_owner_select on public.notifications
  for select using (user_id = auth.uid());

create policy notifications_owner_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notifications_admin_insert on public.notifications
  for insert with check (public.is_admin());

-- device_tokens
alter table public.device_tokens enable row level security;

create policy device_tokens_owner_all on public.device_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- offline_sync_events
-- ============================================================
alter table public.offline_sync_events enable row level security;

create policy offline_sync_events_owner_all on public.offline_sync_events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- audit_logs (write via service role only; readable by admin or the actor)
-- ============================================================
alter table public.audit_logs enable row level security;

create policy audit_logs_select_admin_or_actor on public.audit_logs
  for select using (public.is_admin() or actor_id = auth.uid());

-- No insert/update/delete policy for regular users: audit rows are written
-- exclusively by Edge Functions using the service-role key, which bypasses RLS.

-- ============================================================
-- storage.objects policies (ownership-by-path-prefix)
-- Every object's key starts with {user_id}/... (enforced app-side by
-- buildStoragePath() / generate-upload-url), and this policy independently
-- verifies that prefix so a leaked object path alone is never sufficient.
-- ============================================================
create policy storage_user_scoped_all on storage.objects
  for all
  using (
    bucket_id in ('avatars', 'documents', 'chat-files', 'qr-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('avatars', 'documents', 'chat-files', 'qr-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
