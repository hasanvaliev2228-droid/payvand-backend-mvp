# Offline-first sync

## Идея

Frontend (Flutter/React Native) маълумотро дар DB-и маҳаллӣ (SQLite/Hive/
Drift) нигоҳ медорад ва амалҳоро дар як queue ҷамъ мекунад. Вақте
интернет барқарор мешавад, queue-ро batch ба `sync-offline-events`
мефиристад.

## Idempotency

Ҳар event `client_event_id`-и беназир (масалан UUID, ки дар клиент сохта
мешавад) дорад. Сервер пеш аз коркард санҷиш мекунад, ки оё ҳамин
`client_event_id` (барои ҳамин корбар) аллакай коркард шудааст — агар бале,
натиҷаи қаблиро бармегардонад, бе такрор.

## Сиёсати конфликт

| Entity | Сиёсат |
|---|---|
| profile / user_settings | Last-write-wins, тибқи `updated_at` |
| transactions | Конфликт ба клиент бармегардад (на merge автоматӣ) — клиент бояд ҳал кунад |
| messages | Append-only — конфликт имконнопазир аст |
| documents | Metadata пас аз upload тағйирнопазир аст, ба ҷуз `title`/`folder` |

## Формати batch

```json
POST /functions/v1/sync-offline-events
{
  "events": [
    {
      "client_event_id": "b3f1...-uuid",
      "entity_type": "transaction",
      "operation": "create",
      "payload": { "type": "expense", "amount": 50, "title": "Хӯрок" },
      "client_created_at": "2026-08-20T10:00:00.000Z"
    }
  ]
}
```

Ҷавоб:

```json
{
  "ok": true,
  "data": {
    "results": [
      { "client_event_id": "b3f1...-uuid", "status": "processed" }
    ]
  }
}
```

`status` метавонад: `processed`, `conflict`, `failed`.

## Мисоли Flutter (pseudo-Dart)

```dart
final queue = await localDb.getPendingSyncEvents();
final response = await supabase.functions.invoke(
  'sync-offline-events',
  body: {'events': queue.map((e) => e.toJson()).toList()},
);
final results = response.data['data']['results'] as List;
for (final r in results) {
  if (r['status'] == 'processed') {
    await localDb.markSynced(r['client_event_id']);
  } else if (r['status'] == 'conflict') {
    await localDb.flagConflict(r['client_event_id']);
  }
}
```

## Мисоли React Native (pseudo-TS)

```ts
const queue = await AsyncStorageQueue.getPending();
const { data, error } = await supabase.functions.invoke('sync-offline-events', {
  body: { events: queue },
});
if (!error) {
  for (const r of data.data.results) {
    if (r.status === 'processed') await queueStore.markSynced(r.client_event_id);
    if (r.status === 'conflict') await queueStore.flagConflict(r.client_event_id);
  }
}
```
