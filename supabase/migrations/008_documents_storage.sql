-- 008_documents_storage.sql

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  original_filename text not null,
  stored_filename text not null,
  file_path text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  folder text default 'general',
  document_type text,
  signature_status text not null default 'unsigned' check (signature_status in ('unsigned', 'signed', 'pending')),
  is_private boolean not null default true,
  scan_status text not null default 'pending_scan' check (scan_status in ('pending_scan', 'clean', 'infected', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_user_id_idx on public.documents(user_id);
create index documents_folder_idx on public.documents(user_id, folder);

-- Storage buckets. Created idempotently so re-running migrations is safe.
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', false),
  ('documents', 'documents', false),
  ('chat-files', 'chat-files', false),
  ('qr-images', 'qr-images', false)
on conflict (id) do nothing;
