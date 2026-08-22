# Frontend Integration (Flutter / React Native)

## Насб

**Flutter**: `supabase_flutter` пакет.
**React Native**: `@supabase/supabase-js` + `react-native-url-polyfill`.

## Ду калиди муҳим

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
```

Ин ду ба frontend меравад. `SUPABASE_SERVICE_ROLE_KEY` **ҳеҷ гоҳ** ба
frontend намеравад.

## Auth: Phone + OTP (Flutter, pseudo-Dart)

```dart
final supabase = Supabase.instance.client;

// 1. Дархости OTP
await supabase.auth.signInWithOtp(phone: '+992...');

// 2. Тасдиқ
final res = await supabase.auth.verifyOTP(
  phone: '+992...',
  token: smsCode,
  type: OtpType.sms,
);
final session = res.session;
```

## Auth (React Native, pseudo-TS)

```ts
await supabase.auth.signInWithOtp({ phone: '+992...' });

const { data, error } = await supabase.auth.verifyOtp({
  phone: '+992...',
  token: smsCode,
  type: 'sms',
});
```

## Хондани профил (RLS автоматӣ соҳибиро маҳдуд мекунад)

```ts
const { data: profile } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', session.user.id)
  .single();
```

## Сохтани транзаксия

```ts
const { data, error } = await supabase.from('transactions').insert({
  user_id: session.user.id,
  type: 'expense',
  amount: 45.5,
  title: 'Хӯрок',
  category_id: someCategoryId,
});
```

## Пардохти файли хусусӣ (documents/chat-files)

```ts
// 1. Signed upload URL
const { data: uploadInfo } = await supabase.functions.invoke('generate-upload-url', {
  body: { bucket: 'documents', mime_type: 'application/pdf', file_size: fileBytes.length, extension: 'pdf' },
});

// 2. PUT мустақим ба signedUrl
await fetch(uploadInfo.data.signedUrl, { method: 'PUT', body: fileBytes });

// 3. Сабти metadata
const { data: doc } = await supabase.functions.invoke('upload-document', {
  body: {
    title: 'Шартнома',
    original_filename: 'contract.pdf',
    mime_type: 'application/pdf',
    file_size: fileBytes.length,
    file_path: uploadInfo.data.path,
  },
});

// 4. Хондани файли хусусӣ (signed download URL)
const { data: signedDownload } = await supabase.storage
  .from('documents')
  .createSignedUrl(doc.data.file_path, 60); // 60 сония эътибор
```

## Realtime chat

Ниг. `docs/realtime-chat.md` барои мисоли пурра.

## Offline sync

Ниг. `docs/offline-sync.md` барои мисоли пурраи Flutter/React Native.

## Танзими Zod-мутобиқ дар frontend (тавсия)

Барои пешгирии хатогиҳо пеш аз фиристодан ба сервер, схемаҳои
`src/schemas/*.ts`-ро (агар monorepo бошад) мустақим дар frontend низ
истифода баред — ҳамон қоидаҳо (масалан `amount > 0`, `last4` танҳо 4
рақам) пеш аз network call санҷида мешаванд, ва UX беҳтар мешавад.
