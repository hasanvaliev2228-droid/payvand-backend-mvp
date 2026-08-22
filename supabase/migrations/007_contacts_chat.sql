-- 007_contacts_chat.sql

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_user_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  phone text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_owner_id_idx on public.contacts(owner_id);
create index contacts_contact_user_id_idx on public.contacts(contact_user_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')),
  title text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_group_needs_title check (type = 'direct' or title is not null)
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  muted_until timestamptz,
  primary key (conversation_id, user_id)
);

create index conversation_members_user_id_idx on public.conversation_members(user_id);

-- Enforces "no duplicate direct conversation between the same two users".
-- A partial unique index on the sorted pair of member ids for direct conversations.
create table public.direct_conversation_pairs (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  constraint direct_pair_ordered check (user_a < user_b)
);

create unique index direct_conversation_pairs_unique on public.direct_conversation_pairs(user_a, user_b);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  message_type text not null default 'text' check (message_type in ('text', 'image', 'file', 'audio', 'system')),
  file_path text,
  reply_to_id uuid references public.messages(id) on delete set null,
  forwarded_from_id uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_body_or_file check (
    message_type = 'text' and body is not null
    or message_type in ('image', 'file', 'audio') and file_path is not null
    or message_type = 'system'
  )
);

create index messages_conversation_id_idx on public.messages(conversation_id, created_at desc);
create index messages_sender_id_idx on public.messages(sender_id);

create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index message_reactions_message_id_idx on public.message_reactions(message_id);
