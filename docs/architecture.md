# Меъмории Payvand Backend

## Умумӣ

Payvand backend бо равиши **Supabase-first** сохта шудааст: NestJS ё дигар
framework-и алоҳида истифода намешавад. Мантиқи бизнес дар се сатҳ ҷойгир аст:

1. **PostgreSQL + RLS** — сарчашмаи ҳақиқии амният. Ҳар сатр танҳо аз тарафи
   соҳиби худ дастрас аст (ниг. `docs/security.md`).
2. **Supabase Edge Functions (Deno/TypeScript)** — барои амалҳое, ки ба
   `service role` ниёз доранд (сохтани чат бо якчанд аъзо, огоҳиномаҳо,
   signed upload URL, sync, delete-account).
3. **TypeScript client modules (`src/modules/*`)** — CRUD-и оддӣ, ки бевосита
   бо JWT-и корбар кор мекунад ва пурра ба RLS такя мекунад. Ин модулҳо дар
   frontend (Flutter/React Native тавассути `supabase-js`) ё дар дигар
   server-side TypeScript код истифода мешаванд.

```
┌─────────────────────────────┐
│   Мобилӣ (Flutter / RN)     │
│  Supabase JS/Dart SDK        │
└───────────────┬──────────────┘
                │  JWT (anon key + user access_token)
                ▼
┌─────────────────────────────────────────────┐
│              Supabase Platform                │
│                                               │
│  ┌───────────────┐   ┌───────────────────┐  │
│  │  PostgREST     │   │  Edge Functions     │  │
│  │  (auto CRUD +  │   │  (Deno, TS)         │  │
│  │   RLS)         │   │  service-role only  │  │
│  └───────┬────────┘   └─────────┬───────────┘  │
│          │                      │              │
│          ▼                      ▼              │
│  ┌─────────────────────────────────────────┐  │
│  │           PostgreSQL + RLS                │  │
│  │  profiles, transactions, loans, chat,     │  │
│  │  documents, calendar, health, ...         │  │
│  └─────────────────────────────────────────┘  │
│                                               │
│  ┌───────────────┐   ┌───────────────────┐  │
│  │ Supabase Auth  │   │ Supabase Storage    │  │
│  │ (Phone OTP)    │   │ (avatars, docs,     │  │
│  │                │   │  chat-files, qr)    │  │
│  └───────────────┘   └───────────────────┘  │
│                                               │
│  ┌───────────────────────────────────────┐  │
│  │           Realtime (Postgres CDC)       │  │
│  │   messages, notifications broadcast      │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Модулҳо (`src/modules/*`)

| Модул | Масъулият |
|---|---|
| `auth` | Phone/OTP wrapper, PIN hashing (scrypt) |
| `profile` | Профил + танзимот |
| `cards` | Кортҳои бонкӣ (танҳо last4, ҳеҷ маълумоти ҳассос) |
| `qr` | QR/barcode records |
| `categories` | Категорияҳои system + корбарӣ |
| `transactions` | Даромад/хароҷот/интиқол |
| `loans` | Қарз + ҷадвали пардохт (`loan-calculator.ts`) |
| `contacts` | Рӯйхати тамос |
| `chat` | Мукотиба, паём, реаксия, membership |
| `documents` | Metadata-и ҳуҷҷат (файл дар Storage) |
| `calendar` | Вазифа/reminder/рӯйдод |
| `health` | Вазн, фишор, дору, ёддошт |
| `services` | Провайдерони хизматрасонӣ |
| `notifications` | Огоҳинома + device tokens |
| `offline-sync` | Client-facing queue helpers |
| `admin` | Панели мудирият (пушида бо RLS is_admin()) |

Ҳар модул: намуди TypeScript (аз `database.types.ts`), Zod schema
(`src/schemas/*` ё schema-и дохилии модул), функсияҳои create/read/update/
delete, pagination/filtering/sorting, error handling ва мисоли истифода дар
JSDoc-и худи файл.

## Чаро на NestJS

Ин лоиҳа бо мақсади сабукӣ, суръати рушд ва такя ба RLS-и худи Supabase
сохта шудааст. NestJS (ё ягон framework-и дигар) илова намешавад, зеро он
лоиҳаро мураккаб мекунад бе фоидаи амниятии иловагӣ: ҳама endpoint-ҳои
CRUD аллакай тавассути PostgREST + RLS автоматӣ ва бехатаранд. Танҳо
Edge Functions (Deno) илова шудаанд, зеро баъзе амалҳо (масалан, сохтани
чат бо якчанд корбар) бояд бо `service role` иҷро шаванд — сабаб дар ҳар
файли Edge Function ва дар `docs/security.md` шарҳ дода шудааст.
