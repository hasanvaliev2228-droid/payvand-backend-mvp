# Storage

## Bucket-ҳо

| Bucket | Public? | Мазмун |
|---|---|---|
| `avatars` | Дар код private сохта шудааст; метавон ба public/signed иваз кард (ниг. поён) | Акси профил |
| `documents` | Private | Ҳуҷҷатҳо (PDF, JPG, PNG, DOCX, XLSX) |
| `chat-files` | Private | Файли чат (PDF, JPG, PNG, MP3, M4A) |
| `qr-images` | Private | Акси QR-и рендершуда |

### Қарори avatars: чаро private?

Гарчанде ки avatar-ҳо метавонанд public бошанд (то фронтенд бидуни signed
URL нишон диҳад), дар ин MVP мо ҳамаи bucket-ҳоро **private** нигоҳ доштем
(`insert into storage.buckets (..., public) values (..., false)`), то:
1. Сиёсати ягона ва содда барои ҳамаи bucket-ҳо бошад (камтар сатҳи хато).
2. Корбар тавонад баъдтар avatar-и худро "хусусӣ" гардонад бе тағйири
   bucket.
Агар лозим шавад, `avatars`-ро ба `public = true` иваз кунед ва
`generate-upload-url`/фронтендро мутобиқ созед — ин қарор дар як SQL
migration оддӣ иваз мешавад.

## Path convention

```
{user_id}/{resource_id}/{random_uuid}.{extension}
```

Номи асливу файл **ҳеҷ гоҳ** ҳамчун storage key истифода намешавад (ниг.
`buildStoragePath()` дар `src/lib/security.ts` ва mirror-и он дар
`generate-upload-url`). Ин пешгирии path traversal ва collision мекунад.

## MIME ва андоза

- `documents`: `application/pdf`, `image/jpeg`, `image/png`,
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- `chat-files`: `application/pdf`, `image/jpeg`, `image/png`,
  `audio/mpeg`, `audio/mp4`.
- Ҳадди андоза аз `STORAGE_MAX_FILE_SIZE_MB` (ENV) гирифта мешавад, дар ҳам
  `generate-upload-url` ва ҳам `upload-document` санҷида мешавад (defense
  in depth).

## Гирдиши кор (upload flow)

```
1. Фронтенд → generate-upload-url { bucket, mime_type, file_size, extension }
2. Сервер MIME/андоза/bucket-ро санҷида, signed URL месозад
   (path = {user_id}/{resource_id}/{uuid}.{ext})
3. Фронтенд файлро мустақим ба он signed URL PUT мекунад
4. Фронтенд → upload-document { title, original_filename, mime_type,
   file_size, file_path, ... }
5. Сервер file_path-ро тафтиш мекунад (бояд бо {user_id}/ оғоз шавад),
   documents metadata сабт мекунад, scan_status = 'pending_scan'
```

## File scanning adapter (mock)

Ягон integration-и антивируси воқеӣ дар ин MVP пайваст нашудааст. Ба ҷои
он, ҳар ҳуҷҷати навбор `scan_status = 'pending_scan'` мегирад. Interface-и
adapter (барои иваз кардан бо ClamAV/VirusTotal/дигар дар оянда):

```ts
export interface FileScanAdapter {
  scan(filePath: string, bucket: string): Promise<'clean' | 'infected' | 'error'>;
}

// mock — на воқеӣ, танҳо placeholder барои интеграцияи оянда:
export const mockScanAdapter: FileScanAdapter = {
  async scan() {
    return 'clean'; // MVP: ҳама 'pending_scan' то integration-и воқеӣ насб шавад
  },
};
```

Дар production, ин adapter-ро бо як воқеӣ (масалан ClamAV дар як
background worker, ки `documents.scan_status`-ро нав мекунад) иваз кунед.

## Storage bucket policies (тавсия барои Dashboard/SQL)

Ҳарчанд bucket-ҳо private сохта шудаанд, объектҳои воқеӣ бояд бо policy-и
Storage низ маҳдуд шаванд (name = object path):

```sql
create policy "Users can manage own files"
  on storage.objects for all
  using (bucket_id in ('avatars','documents','chat-files','qr-images')
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('avatars','documents','chat-files','qr-images')
              and (storage.foldername(name))[1] = auth.uid()::text);
```

Ин policy кафолат медиҳад, ки ҳатто агар path-и объект фош шавад, танҳо
соҳиби воқеии он (аввалин қисми path = user_id) метавонад дастрасӣ дошта
бошад.
