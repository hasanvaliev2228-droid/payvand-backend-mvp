# Базаи маълумот

21 таблица, ҳама бо `id uuid primary key default gen_random_uuid()` (ба ҷуз
`profiles.id`, ки ба `auth.users.id` баробар аст), ҳама вақтҳо `timestamptz`,
ва `updated_at` ба таври худкор бо trigger (`013_indexes_triggers.sql`) нав
мешавад.

## Тартиби migration

| # | Файл | Мазмун |
|---|---|---|
| 001 | extensions | pgcrypto, citext, pg_trgm |
| 002 | roles_profiles | enum-ҳо, `profiles`, auto-create trigger |
| 003 | user_settings | танзимот, PIN hash |
| 004 | cards_qr | `bank_cards` (last4 only), `qr_codes` |
| 005 | categories_transactions | категория + муомилот |
| 006 | loans | `loans`, `loan_payments` |
| 007 | contacts_chat | contacts, conversations, members, messages, reactions, duplicate-prevention |
| 008 | documents_storage | `documents` + 4 storage bucket |
| 009 | calendar_health | calendar_events, health_records |
| 010 | services | service_providers |
| 011 | notifications_devices | notifications, device_tokens |
| 012 | audit_logs | offline_sync_events, audit_logs |
| 013 | indexes_triggers | `set_updated_at()` trigger барои ҳамаи ҷадвалҳои дахлдор + индексҳои иловагӣ |
| 014 | rls_policies | RLS барои ҳамаи ҷадвалҳо |

Тартиб муҳим аст: extension-ҳо пеш аз ҳама сохта мешаванд; `profiles` пеш аз
ҳар чизе, ки ба он `references` дорад; trigger function-ҳо (`set_updated_at`,
`is_admin`, `is_conversation_member`) пеш аз худи trigger/policy сохта
мешаванд; ниҳоят RLS дар охир фаъол мешавад, вақте ки ҳамаи ҷадвалҳо аллакай
вуҷуд доранд.

## Ҷадвалҳои калидӣ

Тавсифи пурраи ҳар сутун дар худи файлҳои `supabase/migrations/*.sql` бо
comment оварда шудааст. Нуктаҳои муҳим:

- **bank_cards**: танҳо `last4 text check (last4 ~ '^[0-9]{4}$')`. Ягон
  сутуни `card_number`, `cvv`, `expiry`, `card_pin` вуҷуд надорад.
- **categories**: check constraint `categories_owner_check` кафолат медиҳад,
  ки категорияи system ҳатман `user_id is null` дорад ва баръакс.
- **conversations / direct_conversation_pairs**: unique index рӯи
  `(user_a, user_b)`-и мураттаб (`user_a < user_b`) пешгирии дубора сохтани
  чат байни ду корбари якхела мекунад.
- **messages**: check constraint кафолат медиҳад, ки паёми матнӣ бе `body`
  ва паёми файлӣ бе `file_path` сохта нашавад; soft delete тавассути
  `deleted_at`.
- **offline_sync_events**: `client_event_id` unique — калиди idempotency.
- **audit_logs**: ҳеҷ policy-и insert/update/delete барои корбари оддӣ
  нест — танҳо Edge Function-ҳо (service role) метавонанд навишт кунанд.

## ER diagram (матнӣ, соддашуда)

```
auth.users 1───1 profiles 1───1 user_settings
profiles 1───* bank_cards
profiles 1───* qr_codes
profiles 1───* categories (nullable → system)
profiles 1───* transactions ──* categories
profiles 1───* loans 1───* loan_payments
profiles 1───* contacts
profiles *───* conversations (through conversation_members)
conversations 1───* messages 1───* message_reactions
profiles 1───* documents
profiles 1───* calendar_events
profiles 1───* health_records
profiles 1───* service_providers (owner, nullable)
profiles 1───* notifications
profiles 1───* device_tokens
profiles 1───* offline_sync_events
profiles 1───* audit_logs (actor, nullable)
```

## Генератсияи типҳо

```bash
npm run db:types
# ба таври дохилӣ иҷро мекунад:
# supabase gen types typescript --local > src/types/database.types.ts
```

`src/types/database.types.ts`-и дар лоиҳа мавҷудбуда дастӣ навишта шудааст
(то компилятсия пеш аз аввалин `supabase start` кор кунад) ва бо ҳамин SQL
мутобиқ аст; пас аз ҳар тағйироти migration ин command-ро аз нав иҷро кунед.
