-- Final ownership hardening.  This migration is additive and safe to apply
-- after the original policy set.

-- A self-insert policy allowed any authenticated person who knew a UUID to
-- add themselves to a private conversation. Membership changes are made only
-- by the authenticated create/group-management Edge Functions using the
-- service role after validating the request.
drop policy if exists conversation_members_insert_self on public.conversation_members;

-- A member may only update their read/mute state. Identity, conversation and
-- role changes must go through the server-side membership workflow.
create or replace function public.guard_conversation_member_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.conversation_id is distinct from old.conversation_id
     or new.user_id is distinct from old.user_id
     or new.member_role is distinct from old.member_role
     or new.joined_at is distinct from old.joined_at then
    raise exception 'conversation membership identity is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_members_immutable on public.conversation_members;
create trigger conversation_members_immutable
  before update on public.conversation_members
  for each row execute function public.guard_conversation_member_update();

-- Senders may edit/delete content, but cannot move a message to another
-- conversation or impersonate another sender through a direct table update.
create or replace function public.guard_message_identity_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.created_at is distinct from old.created_at
     or new.message_type is distinct from old.message_type
     or new.file_path is distinct from old.file_path
     or new.reply_to_id is distinct from old.reply_to_id
     or new.forwarded_from_id is distinct from old.forwarded_from_id then
    raise exception 'message identity fields are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_identity_immutable on public.messages;
create trigger messages_identity_immutable
  before update on public.messages
  for each row execute function public.guard_message_identity_update();

-- Explicitly force RLS for all personally-owned finance/document tables so a
-- future owner-context SQL path cannot accidentally bypass tenant isolation.
alter table public.bank_cards force row level security;
alter table public.qr_codes force row level security;
alter table public.transactions force row level security;
alter table public.loans force row level security;
alter table public.loan_payments force row level security;
alter table public.documents force row level security;
alter table public.document_scans force row level security;
alter table public.budgets force row level security;
alter table public.offline_sync_events force row level security;
alter table public.device_tokens force row level security;
alter table public.calendar_events force row level security;
alter table public.health_records force row level security;

-- Only the security-definer helpers required by policies remain callable to
-- API roles; rate limiting remains service-role only (migration 021).
revoke all on function public.guard_conversation_member_update() from public, anon, authenticated;
revoke all on function public.guard_message_identity_update() from public, anon, authenticated;
