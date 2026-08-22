# API (Edge Functions)

Ҳамаи Edge Function-ҳо:
- `Authorization: Bearer <access_token>` талаб мекунанд (ба ҷуз паёми
  `OPTIONS` барои CORS preflight).
- Input-ро бо Zod санҷиш мекунанд ва дар хатогӣ `422 VALIDATION_ERROR`
  бармегардонанд.
- Формати ягонаи ҷавоб доранд: `{ ok: true, data }` ё
  `{ ok: false, error: { code, message, details? } }`.
- CORS header доранд (`Access-Control-Allow-Origin: *`, ва ғайра).

## 1. `create-qr` — POST

Body: `{ title, qr_type, payload }`
Ҷавоб: сатри навсохтаи `qr_codes`.

## 2. `calculate-loan` — POST

Body: `{ principal_amount, interest_rate, start_date, due_date, payment_frequency }`
Ҷавоб: `{ totalInterest, totalPayable, installmentCount, installmentAmount, schedule[] }`
Ин функсия ба база чизе наменависад — танҳо ҳисоб мекунад (preview).

## 3. `send-notification` — POST (ADMIN танҳо)

Body: `{ user_id, title, body?, notification_type?, data? }`
Санҷиши `profiles.role === 'admin'` пеш аз ҳар кор иҷро мешавад.
Push ба воситаи mock adapter (агар Firebase credential набошад) ё Firebase
adapter (агар бошад) фиристода мешавад.

## 4. `upload-document` — POST

Пеш аз ин, фронтенд бояд аз `generate-upload-url` як signed URL гирад ва
файлро мустақим ба Storage бор кунад. Баъд ин функсия metadata-ро сабт
мекунад. Body: `{ title, original_filename, mime_type, file_size, file_path, folder?, document_type?, is_private? }`.
`file_path` бояд бо `{user_id}/` оғоз шавад — вагарна `403 FORBIDDEN`.

## 5. `create-conversation` — POST

Body: `{ type: 'direct'|'group', title?, member_ids: string[], image_path? }`
Барои `direct`, агар пеш аз ин байни ҳамин ду корбар чат вуҷуд дошта бошад,
ҳамон чат бармегардонад (`alreadyExisted: true`), на нусхаи нав.

## 6. `send-message` — POST

Body: `{ conversation_id, message_type?, body?, file_path?, reply_to_id?, forwarded_from_id? }`
Пеш аз навиштан membership-и фиристанда санҷида мешавад.

## 7. `mark-conversation-read` — POST

Body: `{ conversation_id }`. Танҳо `last_read_at`-и худи занги корбарро нав
мекунад.

## 8. `generate-upload-url` — POST

Body: `{ bucket, mime_type, file_size, resource_id?, extension }`
Ҷавоб: `{ bucket, path, signedUrl, token, expiresInSeconds }`.
MIME ва андоза мувофиқи bucket санҷида мешаванд (ниг. `docs/storage.md`).

## 9. `sync-offline-events` — POST

Body: `{ events: [{ client_event_id, entity_type, entity_id?, operation, payload, client_created_at }] }`
(ҳадди аксар 200 дар як batch). Ҷавоб: рӯйхати натиҷа барои ҳар event
(`processed` / `conflict` / `failed`), бо идемпотентӣ рӯи `client_event_id`.

## 10. `delete-account` — POST

Body: `{ confirm: true }` (ҳатмист). Auth.users-ро тавассути
`auth.admin.deleteUser()` нест мекунад — ин бо cascade маълумоти дигар
таблицаҳоро низ пок мекунад (ба ҷуз он чизе, ки `ON DELETE SET NULL`
дорад, масалан `service_providers.owner_id`).

## Client modules (`src/modules/*`)

Барои амалҳои оддии CRUD (профил, транзаксия, календарь, ва ғайра), фронтенд
метавонад ё мустақим тавассути `@supabase/supabase-js` (бо RLS) кор кунад, ё
ин функсияҳоро аз пакети `payvand-backend-mvp` (агар дар monorepo истифода
шавад) даъват намояд — онҳо ҳамон PostgREST query-ҳоро месозанд, бо
validation ва typed response.
