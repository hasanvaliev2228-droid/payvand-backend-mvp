# Payvand backend API contract (MVP)

This is the stable handoff contract for the future frontend. All Edge Function
responses use JSON envelopes: successful calls return `{ "ok": true, "data": ... }`;
failures return `{ "ok": false, "error": { "code": string, "message": string } }`.
Validation errors may also contain `error.details`. Do not render `message` as
trusted HTML.

## Common rules

`POST https://dnsyjzwsfmwpsfoyqoud.supabase.co/functions/v1/{function}` is the
production base URL. Send `Content-Type: application/json` and an end-user
Supabase session JWT as `Authorization: Bearer <access_token>` for every
endpoint except `request-otp` and `verify-otp`. Never use the service-role key
in a client. Clients must treat `401` as sign-out/session refresh, `422` as
input feedback, `429` as backoff, and `5xx` as retryable only where safe.

| Area         | Function                                                                        | Request highlights                                                         | Success                                                                     | Important failures                                                       |
| ------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Auth         | `request-otp`                                                                   | phone number                                                               | OTP request accepted                                                        | `422`, `429`                                                             |
| Auth         | `verify-otp`                                                                    | phone number + code                                                        | session/token payload                                                       | `401`, `422`, `429`                                                      |
| Finance      | `finance-analysis`                                                              | optional date/filter payload                                               | financial summary                                                           | `401`, `422`                                                             |
| Finance      | `ai-finance-chat`                                                               | `{ message: string(1..2000), summary?: object }`                           | `{ provider, status, message }`                                             | `401`, `422`, `429`, `502`, `503`                                        |
| Receipt      | `scan-document`                                                                 | `file_name`, `mime_type`, base64 file, `scan_type`, optional `document_id` | persisted `document_scans` row, `201`                                       | `401`, `422`; a failed scan is a valid `201` row with `status: "failed"` |
| Receipt      | `receipt-to-transaction`                                                        | `scan_id`, explicit confirmed amount/title/currency/category/date          | transaction row, `201`                                                      | `401`, `404`, `409`, `422`, `429`; `Idempotency-Key` is required         |
| Barcode      | `barcode-lookup`                                                                | `{ barcode: "8–14 digits" }`                                               | `{ provider, barcode, product: { name, brand?, image_url?, categories? } }` | `401`, `404`, `422`, `429`, `502`, `503`                                 |
| Chat         | `create-conversation`                                                           | `type`, `member_ids`, `title` for groups                                   | conversation row, `201` or `alreadyExisted`                                 | `401`, `422`                                                             |
| Chat         | `send-message`                                                                  | `conversation_id`, message content/attachment fields                       | message row, `201`                                                          | `401`, `403`, `422`                                                      |
| Documents    | `generate-upload-url`, `upload-document`, `upload-chat-media`, `delete-account` | see source schemas                                                         | resource/action result                                                      | `401`, `403`, `422`                                                      |
| Productivity | notes, attendance, employee, loan, notification, theme and sync functions       | see each colocated Zod schema                                              | `{ ok: true, data }`                                                        | `401`, `422`                                                             |

## OCR behavior

`scan-document` accepts only JPEG, PNG, WebP and PDF up to 15 MiB. OCR is an
asynchronous-provider-style result persisted as a scan row; the frontend must
show extracted fields as suggestions, never silently create a transaction.

- `OCR_PROVIDER=google_vision` with the server-only `OCR_API_KEY` enables
  Google Cloud Vision for images.
- With no configured provider, the scan is stored with `provider:
"not_configured"` and `status: "failed"`; no placeholder extraction is
  invented.
- Google Vision PDF processing is deliberately reported as failed because its
  synchronous endpoint does not support PDF bytes. A future async/GCS provider
  can be added without changing this response contract.

## Barcode behavior

`barcode-lookup` is authenticated and rate-limited (30 requests/minute/user).
It is disabled by default. Enable only by setting the server-side Edge Function
secret `BARCODE_PROVIDER=open_food_facts`. The Open Food Facts adapter returns
only actual upstream data; an unknown barcode is `404`, never a fake product.

## Security expectations for frontend

Database access is tenant-scoped by RLS. Use the authenticated Supabase client
only for tables/features explicitly supported by the app; privileged operations
belong to Edge Functions. Storage object paths are always owned paths beginning
with `{user_id}/`. Never use a path supplied by another user.

## Contract versioning

This document is MVP contract version 1. Add fields compatibly; do not rename
or remove existing response fields, success envelopes, or error codes without
shipping a versioned endpoint and a frontend migration plan.
