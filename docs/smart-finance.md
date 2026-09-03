# Smart Finance backend

This additive upgrade preserves the existing transactions, QR and OCR APIs.

- `create-payment-request`: creates an owner-scoped payment request and returns a `payvand://payment-request/{id}` URI. Send a unique `Idempotency-Key` header (16–200 chars); only its SHA-256 hash is stored. Pass that URI to the existing `create-qr` function with `qr_type: "payment_request"` to make a QR record. The endpoint records a request; it does not move money or claim a payment is settled.
- `finance-analysis`: calculates income, expenses, net cash flow, savings rate and a transparent 0–100 health score from the caller's own transaction history for a supplied `from`/`to` date range. A score is `null` when income is absent.
- `ai-finance-chat`: is a safe provider boundary. With no `AI_FINANCE_API_KEY`, it returns `not_configured`; a real adapter must be implemented and deployed with its secret server-side.
- `receipt-to-transaction`: converts a completed OCR scan to one expense only after the owner explicitly supplies and confirms the amount and title. It is rate-limited and audit logged; extracted OCR values are never auto-posted as money movement.
- Budgets are owner-scoped and cover a category or all expenses for a fixed period. Budget progress is calculated from confirmed transaction rows.
- Barcode/product lookup is an interface only. It returns `not_configured` until a vetted provider is explicitly connected; no catalogue data is fabricated or cached.

## Deployment

Apply `020_smart_finance.sql`, regenerate database types (`npm run db:types`), then deploy the three new functions. Set provider credentials only with `supabase secrets set`; never send credentials from a mobile client or commit them.

`payment_requests`, `provider_connections`, and `finance_insights` are owner-RLS scoped. `idempotency_keys` has no direct client policy and is reserved for server-side replay controls.
