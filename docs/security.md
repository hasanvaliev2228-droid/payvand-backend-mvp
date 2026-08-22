# Амният (Threat model ва политикаҳо)

## 1. Threat model

| Таҳдид | Мудофиа |
|---|---|
| Корбар кӯшиш мекунад маълумоти корбари дигарро хонад/нависад | RLS дар ҳар ҷадвал (014_rls_policies.sql), санҷидашуда бо `tests/rls-ownership.test.ts` |
| Корбар кӯшиш мекунад худро admin кунад | `profiles_update_own` policy рӯли-ро тағйирнопазир мегузорад, ба ҷуз тавассути admin |
| Корбари бегона паёми чатро мехонад | `is_conversation_member()` дар ҳар policy-и `messages`/`conversations` |
| Full PAN/CVV/PIN-и корт ба сервер меравад | Ягон field-и мувофиқ дар schema/DB вуҷуд надорад; `assertNoSensitiveCardData()` ҳамчун лояи иловагӣ |
| OTP дар DB нигоҳ дошта мешавад | Supabase Auth (GoTrue) OTP-ро пурра идора мекунад; ягон сутуни OTP дар `profiles`/дигар ҷадвал нест |
| Файли зараровар бор карда мешавад | MIME whitelist дар schema + Edge Function + Storage policy; `scan_status = 'pending_scan'` то integration-и антивирус (mock adapter) |
| Service role key ба frontend мерасад | `supabase-admin.ts` ҳеҷ гоҳ аз `src/modules/*` import намешавад (санҷида дар `edge-functions.test.ts`); он танҳо дар Edge Functions ва скриптҳои server-side истифода мешавад |
| Signed upload URL сӯиистифода мешавад | Муддати кӯтоҳ (`UPLOAD_URL_EXPIRY_SECONDS`), path бо `{user_id}/` маҳдуд |

## 2. RLS policy explanation

Ҳар ҷадвали корбарӣ `enable row level security` дорад ва ҳар амал (select/
insert/update/delete) policy-и худро дорад — RLS "deny-by-default" аст:
агар policy набошад, дастрасӣ нест. Ду функсияи ёрирасон:

- `public.is_admin()` — санҷиши `profiles.role = 'admin' and is_active = true`.
- `public.is_conversation_member(conversation_id)` — санҷиши узвият дар чат.

## 3. Сиёсати маълумоти ҳассос

- **Кортҳои бонкӣ**: танҳо `last4`, `bank_name`, `cardholder_name`, `title`,
  `color`. Full PAN, CVV, expiry, ва card PIN ҳеҷ гоҳ қабул намешаванд.
- **PIN-и дохилии барнома**: hash (scrypt, дар `auth.service.ts`) дар
  `user_settings.pin_hash`. Raw PIN ҳеҷ гоҳ дар DB нест.
- **OTP**: пурра дар назди Supabase Auth / SMS provider — ягон сатр дар
  ягон ҷадвали `public` нест.
- **Ҳуҷҷатҳо**: default private (`is_private = true`), MIME ва андоза
  санҷида мешаванд, номи асливу файл sanitize мешавад ва ҳамчун калиди
  storage истифода намешавад.

## 4. Сиёсати бор кардани файл

Ниг. `docs/storage.md` барои ҷузъиёт: bucket-ҳо, path convention, MIME
whitelist, ва mock antivirus adapter.

## 5. Стратегияи rate limiting

Ин MVP худи Supabase-и hosted-ро истифода мебарад, ки дар сатҳи platform
(PostgREST ва GoTrue) аллакай rate limiting дорад. Барои Edge Functions-и
худӣ тавсия дода мешавад:
- Supabase Dashboard → Auth → Rate Limits барои OTP (пешгирии SMS-bombing).
- Дар production, як jsonb counter дар `audit_logs` ё Redis-и алоҳида барои
  маҳдуд кардани `send-notification` ва `sync-offline-events` дар як вақти
  муайян илова кардан мумкин аст (берун аз доираи ин MVP).

## 6. API security

- Ҳар Edge Function JWT-ро тасдиқ мекунад (`supabase.auth.getUser()`).
- Ҳар input бо Zod санҷида мешавад.
- Хатогиҳо ҳеҷ гоҳ stack trace ё маълумоти дохилии DB намебароранд — паёми
  умумӣ («Хатогии дохилӣ.») бармегардад, тафсилот танҳо дар `VALIDATION_ERROR`
  (аз Zod, бехатар).

## 7. Сиёсати logging

- `console.warn`/`console.error` танҳо барои ҳолатҳои ғайримунтазира ва
  push-notification mock истифода мешаванд — ҳеҷ маълумоти ҳассос (PIN,
  токен, JWT пурра) ба лог намеравад.
- IP суроға ҳеҷ гоҳ raw нигоҳ дошта намешавад — `hashIp()` бо pepper hash
  мекунад пеш аз сабт (агар истифода шавад).

## 8. Сиёсати audit

Амалҳои ҳассос ба `audit_logs` сабт мешаванд: `send_notification`,
`generate_upload_url`, `upload_document`, `create_conversation`,
`delete_account_requested`. Ҳар сабт: `actor_id`, `action`, `entity_type`,
`entity_id`, `metadata` (jsonb, бе маълумоти ҳассос).

## 9. RLS verification (санҷиши дастӣ бо ду JWT)

Барои санҷиши воқеӣ (integration) дар як Supabase project-и зинда:

```bash
# 1. Ду корбар бо OTP сабти ном кунед, JWT-ҳояшонро гиред.
# 2. Бо JWT-и корбари A як transaction созед.
# 3. Бо JWT-и корбари B кӯшиш кунед ҳамон transaction-ро хонед:
curl -X GET "$SUPABASE_URL/rest/v1/transactions?id=eq.<id-of-A>" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer <B's JWT>"
# Интизор: рӯйхати холӣ (RLS корбари B-ро иҷозат намедиҳад).
```

## 10. Incident response checklist

1. Дастрасии шубҳанокро дар `audit_logs` муайян кунед (`actor_id`,
   `action`, `created_at`).
2. Агар JWT дуздида шуда бошад: корбарро маҷбур кунед бо
   `supabase.auth.admin.signOut(userId, 'global')` аз ҳама device баромада
   шавад.
3. Агар service role key фош шуда бошад: онро дар Supabase Dashboard фавран
   rotate кунед ва ҳамаи Edge Function secrets-ро нав кунед
   (`supabase secrets set`).
4. Барои сӯиистифодаи storage: bucket policy ва `documents.scan_status`-ро
   бознигарӣ кунед, объектҳои шубҳанокро хориҷ кунед.
5. Ҳама тағйиротро дар як хулосаи алоҳида (`postmortem.md`, берун аз ин
   repo) сабт кунед.
