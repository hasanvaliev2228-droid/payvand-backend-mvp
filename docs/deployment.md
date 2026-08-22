# Deployment

## Пешниёзҳо

- Supabase account ва project (dashboard.supabase.com)
- Supabase CLI (ниг. README барои насб)
- Node.js 18+

## Қадамҳо

```bash
# 1. Пайваст ба project
supabase login
supabase link --project-ref <SUPABASE_PROJECT_REF>

# 2. Push кардани migrations
supabase db push

# 3. Seed (танҳо категорияҳои system, бехатар)
supabase db reset --seed   # local
# ё дар production, seed.sql-ро дастӣ тавассути SQL editor иҷро кунед,
# зеро `db reset` тамоми маълумоти production-ро нест мекунад.

# 4. Secrets (Edge Functions)
supabase secrets set \
  SUPABASE_SERVICE_ROLE_KEY=... \
  STORAGE_MAX_FILE_SIZE_MB=10 \
  UPLOAD_URL_EXPIRY_SECONDS=300 \
  PUSH_PROVIDER=mock

# 5. Deploy Edge Functions
supabase functions deploy create-qr
supabase functions deploy calculate-loan
supabase functions deploy send-notification
supabase functions deploy upload-document
supabase functions deploy create-conversation
supabase functions deploy send-message
supabase functions deploy mark-conversation-read
supabase functions deploy generate-upload-url
supabase functions deploy sync-offline-events
supabase functions deploy delete-account
# ё ҳамаро якбора:
supabase functions deploy

# 6. Генератсияи типҳои TypeScript аз DB-и зинда
npm run db:types
```

## Production deployment checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` танҳо дар Supabase secrets, ҳеҷ гоҳ дар
      git ё frontend bundle.
- [ ] Phone OTP provider (Twilio/MessageBird/Vonage) дар Dashboard → Auth
      → Phone танзим шудааст (пеш аз ин, OTP кор намекунад).
- [ ] Rate limit-и OTP дар Dashboard фаъол аст.
- [ ] Ҳамаи 14 migration бомуваффақият push шудаанд (`supabase migration
      list`).
- [ ] RLS барои ҳамаи ҷадвал фаъол аст (санҷед бо
      `select tablename from pg_tables where schemaname='public' and
      rowsecurity=false;` — рӯйхат бояд холӣ бошад).
- [ ] Storage bucket-ҳо (`avatars`, `documents`, `chat-files`,
      `qr-images`) вуҷуд доранд ва policy доранд.
- [ ] `.env`-и production (frontend) танҳо `SUPABASE_URL` ва
      `SUPABASE_ANON_KEY` дорад — **ҳеҷ гоҳ** service role.
- [ ] Firebase/OneSignal credentials (агар push воқеӣ лозим бошад) дар
      secrets гузошта шудаанд; вагарна `PUSH_PROVIDER=mock` мемонад.
- [ ] Backup автоматии Supabase (Point-in-time Recovery) фаъол аст (Pro
      plan ё болотар).

## Backup

Supabase (Pro plan+) PITR (Point-in-Time Recovery)-ро худкор пешниҳод
мекунад. Барои backup-и дастӣ:

```bash
supabase db dump --data-only -f backup_$(date +%Y%m%d).sql
```

Барои backup-и storage объектҳо, `supabase storage` CLI ё скрипти
алоҳидаи `rclone`/`aws s3 sync`-монанд (агар S3-мутобиқ endpoint дошта
бошад) истифода баред.

## Rollback

```bash
# Дидани таърихи migration
supabase migration list

# Барқарор кардани як нусхаи қаблӣ аз backup
psql "$DATABASE_URL" < backup_20260801.sql

# Барои бекор кардани як Edge Function-и нав deploy шуда:
supabase functions deploy <name> --no-verify-jwt=false  # версияи қаблиро аз git checkout карда, боз deploy кунед
```

Supabase ҳоло built-in "one-click rollback" надорад — стратегияи тавсиешуда:
version control (git) барои код + PITR барои маълумот.

## Troubleshooting

| Мушкилот | Сабаби эҳтимолӣ | Ҳал |
|---|---|---|
| `RLS policy violation` дар insert | `user_id`/`owner_id` дар payload нодуруст ё намерасад | Боварӣ ҳосил кунед, ки JWT-и дуруст фиристода мешавад ва field-и ownership дар insert ҳаст |
| Edge Function 401 ҳамеша | Authorization header намерасад ё JWT кӯҳна | Токенро аз `supabase.auth.getSession()` нав гиред |
| OTP намерасад | SMS provider танзим нашудааст | Dashboard → Auth → Phone → провайдерро танзим кунед |
| `duplicate key value violates unique constraint direct_conversation_pairs_unique` | Кӯшиши сохтани дуввумин чат бо ҳамон 2 корбар мустақим (бе Edge Function) | Ҳамеша аз `create-conversation` истифода баред, на insert-и мустақим |
| Storage upload 403 | Signed URL муддаташ гузаштааст | `UPLOAD_URL_EXPIRY_SECONDS`-ро зиёд кунед ё зудтар бор кунед |
