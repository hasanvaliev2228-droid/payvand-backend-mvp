-- OTP remains inaccessible to client roles. Edge Functions use the service-role client.
alter table public.otp_codes
  add column if not exists provider_txn_id text,
  add column if not exists sent_at timestamptz;

create unique index if not exists otp_codes_provider_txn_id_key
  on public.otp_codes (provider_txn_id)
  where provider_txn_id is not null;

create index if not exists otp_codes_phone_created_at_idx
  on public.otp_codes (phone, created_at desc);
