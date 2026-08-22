-- 004_cards_qr.sql
-- Bank cards are DISPLAY / RECORD-KEEPING ONLY. Full PAN, expiry and payment verification data
-- are never accepted or stored. Only last4 is kept.

create table public.bank_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  bank_name text not null,
  cardholder_name text,
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  card_network text check (card_network in ('visa', 'mastercard', 'mir', 'unionpay', 'other')),
  color text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bank_cards_user_id_idx on public.bank_cards(user_id);

create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  qr_type text not null check (qr_type in ('card', 'contact', 'payment_request', 'custom')),
  payload text not null,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index qr_codes_user_id_idx on public.qr_codes(user_id);
