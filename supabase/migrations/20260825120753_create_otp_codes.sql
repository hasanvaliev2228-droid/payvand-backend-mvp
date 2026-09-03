-- OTP codes storage for phone authentication

create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),

  phone text not null,

  -- store hashed OTP, never plain code
  code_hash text not null,

  expires_at timestamptz not null,

  attempts integer not null default 0,

  verified_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists otp_codes_phone_idx
  on public.otp_codes(phone);

create index if not exists otp_codes_expires_at_idx
  on public.otp_codes(expires_at);


-- RLS
alter table public.otp_codes enable row level security;


-- Users should not directly read OTP codes
create policy otp_codes_no_select
  on public.otp_codes
  for select
  using (false);


-- Insert/update will be done by Edge Functions using service role
create policy otp_codes_no_insert
  on public.otp_codes
  for insert
  with check (false);


create policy otp_codes_no_update
  on public.otp_codes
  for update
  using (false);


create policy otp_codes_no_delete
  on public.otp_codes
  for delete
  using (false);