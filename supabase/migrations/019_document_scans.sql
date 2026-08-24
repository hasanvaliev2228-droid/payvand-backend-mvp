-- 019_document_scans.sql
-- OCR + AI document scanning: receipts, invoices, business documents,
-- personal documents. Reuses the EXISTING "documents" Storage bucket
-- (008_documents_storage.sql) and its ownership-by-path-prefix policy
-- (014_rls_policies.sql) for the source image/PDF — no new bucket is
-- created. This table stores the scan's lifecycle + the structured data an
-- OCR/AI provider extracted from it.

create table public.document_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Optional link to a formal `documents` row (e.g. once the user decides
  -- to keep the scanned image as a permanent document). A quick one-off
  -- receipt scan need not create a `documents` row at all.
  document_id uuid references public.documents(id) on delete set null,
  file_path text not null,
  scan_type text not null check (scan_type in ('receipt', 'invoice', 'business_document', 'personal_document')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  provider text not null default 'mock',
  extracted_merchant_name text,
  extracted_amount numeric(14, 2) check (extracted_amount is null or extracted_amount >= 0),
  extracted_currency text,
  extracted_date date,
  extracted_category text,
  raw_text text,
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.document_scans is 'OCR/AI-extracted structured data from a scanned receipt, invoice, or document image. The source file lives in the existing "documents" Storage bucket.';
comment on column public.document_scans.provider is 'Which OCR/AI backend produced this result: "mock" (no OCR_API_KEY configured) or a real provider name (e.g. "openai", "google_vision").';

create index document_scans_user_id_idx on public.document_scans(user_id, created_at desc);
create index document_scans_status_idx on public.document_scans(status);
create index document_scans_scan_type_idx on public.document_scans(user_id, scan_type);
create index document_scans_document_id_idx on public.document_scans(document_id) where document_id is not null;

create trigger set_updated_at before update on public.document_scans
  for each row execute function public.set_updated_at();

-- ============================================================
-- RLS: owner-only, same pattern as documents_owner_all.
-- ============================================================
alter table public.document_scans enable row level security;

create policy document_scans_owner_all on public.document_scans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
