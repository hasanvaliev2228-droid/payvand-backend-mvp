-- 015_chat_attachments.sql
-- Extends the EXISTING chat system (conversations / conversation_members /
-- messages / message_reactions, introduced in 007_contacts_chat.sql) with
-- rich attachment support: images, voice messages, and files — WhatsApp/
-- Telegram style. No new chat tables are created; this migration only
-- ALTERs `messages` and adds the `chat-media` storage bucket + policies.
--
-- Backward compatibility:
-- The legacy `file_path` column remains for backward compatibility.
--   - The legacy `file_path` column (used by earlier 'image' | 'file' |
--     'audio' messages) is KEPT as-is. Nothing that already relies on it
--   - The legacy message_type value 'audio' is KEPT as an accepted value
--     alongside the new 'voice' value, so existing data/tests referencing
--     'audio' keep working. New clients should send 'voice' going forward.
--   - `messages_body_or_file` is relaxed to accept EITHER `file_path`
--     (legacy) OR the new `file_url` for non-text message types.

-- ============================================================
-- 1. New columns on messages
-- ============================================================
alter table public.messages
  add column if not exists file_url text,
  add column if not exists file_name text,
  add column if not exists file_size bigint check (file_size is null or file_size > 0),
  add column if not exists mime_type text,
  add column if not exists voice_duration_seconds integer check (
    voice_duration_seconds is null or voice_duration_seconds > 0
  );

comment on column public.messages.file_url is
  'Storage object path (bucket "chat-media") for image/voice/file messages, e.g. {user_id}/images/{uuid}.jpg. Resolved to a signed URL client-side via supabase.storage.from(''chat-media'').createSignedUrl().';
comment on column public.messages.file_name is 'Original, sanitized filename — display purposes only, never used as the storage key.';
comment on column public.messages.file_size is 'File size in bytes, as reported/validated at upload time.';
comment on column public.messages.mime_type is 'MIME type of the attachment, validated against the allowed list at upload time.';
comment on column public.messages.voice_duration_seconds is 'Duration of a voice message, in seconds. Only meaningful when message_type = ''voice''.';

-- ============================================================
-- 2. message_type: add 'voice' alongside the existing values
-- ============================================================
alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type in ('text', 'image', 'voice', 'file', 'audio', 'system'));

-- ============================================================
-- 3. Relax messages_body_or_file to accept file_url as well as file_path
-- ============================================================
alter table public.messages drop constraint if exists messages_body_or_file;
alter table public.messages add constraint messages_body_or_file check (
  (message_type = 'text' and body is not null)
  or (message_type in ('image', 'file', 'audio', 'voice') and (file_path is not null or file_url is not null))
  or (message_type = 'system')
);

-- ============================================================
-- 4. Indexes (conversation_id, sender_id, created_at)
-- messages_conversation_id_idx (conversation_id, created_at desc) and
-- messages_sender_id_idx (sender_id) already exist from 007_contacts_chat.sql.
-- The plain single-column indexes below are added explicitly so lookups
-- that filter by exactly one of these columns (e.g. admin/audit queries,
-- attachment cleanup jobs) can use a narrower index than the composite one.
-- ============================================================
create index if not exists messages_conversation_id_plain_idx on public.messages(conversation_id);
create index if not exists messages_created_at_idx on public.messages(created_at desc);
-- messages_sender_id_idx already covers sender_id; no duplicate created.

-- ============================================================
-- 5. Storage bucket: chat-media
-- Folder convention: {user_id}/{images|voice|files}/{random_uuid}.{ext}
-- ============================================================
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

-- ============================================================
-- 6. Helper: is the current user a member of the conversation that a given
-- chat-media object belongs to? Looked up via messages.file_url, which
-- stores the exact object path within the chat-media bucket.
-- ============================================================
create or replace function public.is_chat_media_conversation_member(object_name text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.messages m
    join public.conversation_members cm on cm.conversation_id = m.conversation_id
    where cm.user_id = auth.uid()
      and m.file_url = object_name
  );
$$;

-- ============================================================
-- 7. Storage policies for chat-media (owner-based + conversation-member read)
--
-- A user can:
--   - upload/update/delete files under their OWN {user_id}/... prefix
--   - read their own files
--   - read files uploaded by OTHER members of a conversation they belong
--     to (via is_chat_media_conversation_member())
-- A non-member can never read another user's chat-media object.
-- ============================================================
create policy chat_media_select_owner_or_conversation_member on storage.objects
  for select
  using (
    bucket_id = 'chat-media'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_chat_media_conversation_member(name)
    )
  );

create policy chat_media_insert_own on storage.objects
  for insert
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy chat_media_update_own on storage.objects
  for update
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy chat_media_delete_own on storage.objects
  for delete
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Note on messages RLS: no changes needed here. The existing policies
-- (messages_select_member / messages_insert_member / messages_update_own,
-- from 014_rls_policies.sql) already gate every row — regardless of which
-- columns are populated — by public.is_conversation_member(conversation_id).
-- A user who is not a member of a conversation still cannot see ANY of its
-- messages (text or attachment) after this migration.
-- ============================================================
