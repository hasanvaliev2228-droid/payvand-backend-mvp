/**
 * Offline-sync module. The heavy lifting (idempotency + conflict detection
 * for a batch) lives in supabase/functions/sync-offline-events, which runs
 * server-side under the service role so it can apply changes across tables
 * atomically per event. This module exposes the client-facing read/queue
 * helpers used by the mobile app's offline queue.
 *
 * Security note: RLS (offline_sync_events_owner_all) scopes rows to
 * user_id; a user can only ever enqueue/inspect their own sync events.
 *
 * Conflict policy (see docs/offline-sync.md for full detail):
 *   - profile/settings: last-write-wins by updated_at
 *   - transactions: conflicting writes are returned to the client, not merged
 *   - messages: append-only, no update conflicts possible
 *   - documents: metadata immutable after upload except title/folder
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import { insertRow, listRows } from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import {
  offlineSyncEventSchema,
  type OfflineSyncEventInput,
} from '../../schemas/notification.schema';
import type { ListResult } from '../../types/api.types';

type SyncEventRow = Database['public']['Tables']['offline_sync_events']['Row'];

export async function enqueueSyncEvent(
  client: SupabaseClient<Database>,
  userId: string,
  input: OfflineSyncEventInput,
): Promise<SyncEventRow> {
  const values = parseOrThrow(offlineSyncEventSchema, input);
  return insertRow<SyncEventRow>(client, 'offline_sync_events', {
    ...values,
    user_id: userId,
    status: 'pending',
  });
}

export async function listMySyncEvents(
  client: SupabaseClient<Database>,
  userId: string,
  options: Omit<ListOptions, 'filters'> & { status?: string },
): Promise<ListResult<SyncEventRow>> {
  const { status, ...rest } = options;
  return listRows<SyncEventRow>(client, 'offline_sync_events', {
    ...rest,
    filters: { user_id: userId, status },
  });
}

/**
 * Flutter (pseudo) example:
 *   final queued = await localDb.getPendingEvents();
 *   final res = await supabase.functions.invoke('sync-offline-events', body: {'events': queued});
 *
 * React Native (pseudo) example:
 *   const { data } = await supabase.functions.invoke('sync-offline-events', { body: { events: queue } });
 */
