# Realtime Chat

## Channel naming

Ҳар мукотиба channel-и худро дорад, номгузорӣ бо ID (на бо номи корбар ё
маълумоти дигари ҳассос):

```
conversation:{conversation_id}
```

## Мисоли обуна (frontend, TypeScript/JS)

```ts
const channel = supabase
  .channel(`conversation:${conversationId}`)
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
    (payload) => onNewMessage(payload.new),
  )
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
    (payload) => onMessageEdited(payload.new), // edited_at / deleted_at soft-delete
  )
  .subscribe();

// Дар вақти хориҷшавӣ:
await supabase.removeChannel(channel);
```

## Ёддошти амниятӣ (Realtime authorization)

Supabase Realtime барои `postgres_changes` ҳамон RLS policy-ҳоро истифода
мебарад, ки PostgREST истифода мебарад. Ин маънои онро дорад, ки:

- Номи канал (`conversation:{id}`) худаш ягон ҳуқуқи иловагӣ намедиҳад —
  агар корбар узви ҳамон conversation набошад, вай ягон event-и
  INSERT/UPDATE-и `messages`-и он чатро **намегирад**, ҳатто агар ба ҳамон
  channel обуна шавад.
- Пас, гум кардани "махфияти" номи channel хатари амниятӣ надорад — RLS
  дар сатҳи маълумот амал мекунад, на дар сатҳи номи channel.

## Direct ва group chat

- `direct`: рӯйхати corbar_ids бо 2 корбар, дубора сохта намешавад
  (`direct_conversation_pairs` unique index, ниг. `docs/database.md`).
- `group`: title ҳатмист, add/remove member танҳо аз тарафи `owner`
  (тавассути Edge Function/панели admin, на мустақим аз RLS-и корбари
  оддӣ — сабаб: `conversation_members_insert_self` танҳо худсабтро иҷозат
  медиҳад).

## Reply, forward, reaction, soft delete

- `reply_to_id` / `forwarded_from_id` — self-reference ба `messages.id`.
- `message_reactions` — як (message, user, emoji) якто (`unique`).
- Soft delete: `deleted_at` ва `body = null` (ниг. `chat.service.ts →
  deleteMessage`), паём ҳеҷ гоҳ hard delete намешавад, то таърих барои
  дигар аъзоён вайрон нашавад.

## Read receipts

`conversation_members.last_read_at` — ҳар корбар танҳо худи худро нав
мекунад (`mark-conversation-read` Edge Function ё
`chat.service.ts → markConversationRead`).

## File metadata (audio, image, document)

`messages.message_type` (`image | file | audio`) + `file_path`
(storage path дар bucket-и `chat-files`). Метадата (андоза, MIME) дар худи
paylod-и upload гузошта мешавад — ин MVP онро дар `messages` алоҳида
нигоҳ намедорад, вале метавонад дар `file_path`-и стандартӣ дарёфт шавад
(Supabase Storage `getMetadata`/`list`).
