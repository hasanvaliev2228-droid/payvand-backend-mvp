# payvand-backend-mvp

Backend-и production-grade, Supabase-first барои барномаи мобилии
**Payvand** (тоҷикӣ/русӣ). Бе NestJS — PostgreSQL + Row Level Security +
Supabase Edge Functions (TypeScript/Deno).

## Мундариҷа

- [Меъморӣ](#меъморӣ)
- [Танзими Supabase project](#танзими-supabase-project)
- [Насби Supabase CLI](#насби-supabase-cli)
- [Танзими муҳити local](#танзими-муҳити-local)
- [Migration ва seed](#migration-ва-seed)
- [Deploy Edge Functions](#deploy-edge-functions)
- [Генератсияи типҳо](#генератсияи-типҳо)
- [Скриптҳои npm](#скриптҳои-npm)
- [Интеграция бо Flutter](#интеграция-бо-flutter)
- [Интеграция бо React Native](#интеграция-бо-react-native)
- [Auth (Phone OTP)](#auth-phone-otp)
- [Realtime chat](#realtime-chat)
- [Бор кардани файли хусусӣ](#бор-кардани-файли-хусусӣ)
- [Offline sync](#offline-sync)
- [Deployment ва production checklist](#deployment-ва-production-checklist)
- [Backup ва rollback](#backup-ва-rollback)
- [Security checklist](#security-checklist)
- [Troubleshooting](#troubleshooting)
- [Маҳдудиятҳои маълум](#маҳдудиятҳои-маълум)

## Меъморӣ

```
┌─────────────────────────────┐
│   Мобилӣ (Flutter / RN)     │
└───────────────┬──────────────┘
                │ JWT
                ▼
┌─────────────────────────────────────────────┐
│              Supabase Platform                │
│  ┌───────────────┐   ┌───────────────────┐  │
│  │  PostgREST     │   │  Edge Functions     │  │
│  │  (auto CRUD +  │   │  (Deno, TS,         │  │
│  │   RLS)         │   │   service-role)     │  │
│  └───────┬────────┘   └─────────┬───────────┘  │
│          ▼                      ▼              │
│  ┌─────────────────────────────────────────┐  │
│  │           PostgreSQL + RLS                │  │
│  └─────────────────────────────────────────┘  │
│  ┌───────────────┐   ┌───────────────────┐  │
│  │ Supabase Auth  │   │ Supabase Storage    │  │
│  │ (Phone OTP)    │   │ (4 private bucket)  │  │
│  └───────────────┘   └───────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │     Realtime (Postgres CDC)             │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

Тафсили пурра: [`docs/architecture.md`](docs/architecture.md).

## Танзими Supabase project

1. Дар [supabase.com](https://supabase.com) сабти ном кунед ва project
   нав созед.
2. `Project Settings → API`-ро кушоед, `Project URL` ва `anon public key`-
   ро нусхабардорӣ кунед → `.env`.
3. `Project Settings → API → service_role key`-ро нусхабардорӣ кунед →
   **ҳеҷ гоҳ ба frontend/git нафиристед**, танҳо ба Supabase secrets ё
   `.env`-и локалии сервер.
4. `Authentication → Providers → Phone`-ро фаъол кунед ва SMS provider
   (Twilio/MessageBird/Vonage) танзим кунед.

## Насби Supabase CLI

```bash
# macOS/Linux (Homebrew)
brew install supabase/tap/supabase

# ё npm (глобалӣ)
npm install -g supabase

# Санҷиши насб
supabase --version
```

## Танзими муҳити local

```bash
git clone <repo-url> payvand-backend-mvp
cd payvand-backend-mvp
cp .env.example .env
# .env-ро бо URL/key-ҳои воқеӣ пур кунед

npm install

supabase login
supabase link --project-ref <SUPABASE_PROJECT_REF>
```

## Migration ва seed

```bash
# Push кардани ҳамаи 14 migration ба project-и пайвастшуда
supabase db push

# Ё локалӣ (Docker лозим аст барои `supabase start`):
supabase start
supabase db reset          # ҳамаи migration-ро аз нав иҷро мекунад
supabase db reset --seed   # + seed.sql (категорияҳои system)
```

## Deploy Edge Functions

```bash
supabase secrets set \
  STORAGE_MAX_FILE_SIZE_MB=10 \
  UPLOAD_URL_EXPIRY_SECONDS=300 \
  PUSH_PROVIDER=mock

supabase functions deploy   # ҳамаи 10 функсия якбора
# ё алоҳида:
supabase functions deploy create-qr
```

## Генератсияи типҳо

```bash
npm run db:types
# = supabase gen types typescript --local > src/types/database.types.ts
```

## Скриптҳои npm

```bash
npm install
npm run dev            # ts-node/tsx барои санҷиши зуд (агар entrypoint иҷро карда шавад)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint . --ext .ts
npm run lint:fix       # eslint . --ext .ts --fix
npm run format         # prettier --write .
npm run format:check   # prettier --check .
npm run test           # vitest run
npm run test:coverage  # vitest run --coverage
npm run verify         # typecheck + lint + format:check + test якҷоя
```

## Интеграция бо Flutter

Мисоли пурра: [`docs/frontend-integration.md`](docs/frontend-integration.md).

```dart
final supabase = Supabase.instance.client;
await supabase.auth.signInWithOtp(phone: '+992...');
```

## Интеграция бо React Native

```ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
await supabase.auth.signInWithOtp({ phone: '+992...' });
```

## Auth (Phone OTP)

```ts
await supabase.auth.signInWithOtp({ phone: '+992900000000' });
const { data, error } = await supabase.auth.verifyOtp({
  phone: '+992900000000',
  token: '123456',
  type: 'sms',
});
```

Тафсил: [`src/modules/auth/auth.service.ts`](src/modules/auth/auth.service.ts).

## Realtime chat

```ts
supabase
  .channel(`conversation:${conversationId}`)
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
    (payload) => onNewMessage(payload.new))
  .subscribe();
```

Пурра: [`docs/realtime-chat.md`](docs/realtime-chat.md).

## Бор кардани файли хусусӣ

```ts
const { data: up } = await supabase.functions.invoke('generate-upload-url', {
  body: { bucket: 'documents', mime_type: 'application/pdf', file_size: bytes.length, extension: 'pdf' },
});
await fetch(up.data.signedUrl, { method: 'PUT', body: bytes });
await supabase.functions.invoke('upload-document', {
  body: { title: 'Шартнома', original_filename: 'a.pdf', mime_type: 'application/pdf', file_size: bytes.length, file_path: up.data.path },
});
```

Пурра: [`docs/storage.md`](docs/storage.md).

## Offline sync

```ts
const { data } = await supabase.functions.invoke('sync-offline-events', {
  body: { events: queuedEvents },
});
```

Пурра: [`docs/offline-sync.md`](docs/offline-sync.md).

## Deployment ва production checklist

Пурра: [`docs/deployment.md`](docs/deployment.md). Хулосаи кӯтоҳ:

- [ ] `SUPABASE_SERVICE_ROLE_KEY` танҳо дар secrets
- [ ] Phone/OTP provider танзим шудааст
- [ ] Ҳамаи 14 migration push шудаанд
- [ ] RLS дар ҳамаи ҷадвал фаъол аст
- [ ] 4 storage bucket + policy вуҷуд доранд
- [ ] Backup (PITR) фаъол аст

## Backup ва rollback

```bash
supabase db dump --data-only -f backup_$(date +%Y%m%d).sql
psql "$DATABASE_URL" < backup_20260801.sql
```

Пурра: [`docs/deployment.md`](docs/deployment.md#backup).

## Security checklist

Пурра: [`docs/security.md`](docs/security.md). Хулоса:

- Full PAN/CVV/card PIN — ҳеҷ гоҳ қабул/сабт намешаванд.
- Raw OTP — ҳеҷ гоҳ дар DB нест (Supabase Auth онро идора мекунад).
- PIN-и дохилӣ — танҳо hash (scrypt).
- Service role key — танҳо дар Edge Functions.
- RLS — фаъол дар ҳамаи ҷадвали корбарӣ, ownership-based.
- Storage — private buckets + path-prefix policy.

## Troubleshooting

Пурра: [`docs/deployment.md`](docs/deployment.md#troubleshooting).

## Маҳдудиятҳои маълум

- **QR image rendering**: `create-qr` metadata-и QR-ро сабт мекунад;
  рендери воқеии тасвир (агар library-и QR дар муҳити deploy насб бошад)
  ихтиёрӣ аст ва namefunction-ро бас намекунад агар набошад — фронтенд
  метавонад аз `payload` худаш QR рендер кунад.
- **Push notifications**: `PUSH_PROVIDER=mock` бо нобаёнӣ — адаптери
  Firebase воқеӣ (тавассути `FIREBASE_*` secrets) ҳамчун extension point
  омода аст, вале дар ин MVP шабакавӣ намезанад (то credential воқеӣ
  фароҳам ояд).
- **Antivirus/file scanning**: ягон integration-и воқеӣ пайваст нашудааст;
  ҳар ҳуҷҷат `scan_status = 'pending_scan'` мегирад (interface омода барои
  иваз — ниг. `docs/storage.md`).
- **Тасдиқи автоматии `npm install`/`npm test`**: дар муҳити сохта (build
  sandbox)-и ин лоиҳа дастрасии шабакавӣ ба npm registry вуҷуд надошт, пас
  `npm install` дар он ҷо иҷро нашуд. Санҷиши сохториву мантиқии
  TypeScript бо `tsc`-и офлайн (бо stub-ҳои муваққатии намуд барои `zod`/
  `@supabase/supabase-js`) иҷро шуд ва як хатогии воқеӣ (evolving-array
  type дар `calculate-loan`) ёфта ва ислоҳ шуд. **Пеш аз production, шумо
  бояд `npm install && npm run verify`-ро дар муҳити худ бо дастрасии
  network иҷро кунед** — ниг. `BUILD_REPORT.md` барои тафсил.
