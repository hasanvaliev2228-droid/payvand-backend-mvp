/**
 * Notifications + device tokens module.
 * Security note: RLS (notifications_owner_select/update) means users can
 * read/mark-read only their own notifications; only admins (via service
 * role in the send-notification Edge Function) can insert new ones.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import { listRows } from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import {
  registerDeviceTokenSchema,
  type RegisterDeviceTokenInput,
} from '../../schemas/notification.schema';
import type { ListResult } from '../../types/api.types';
import { AppError } from '../../lib/errors';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];
type DeviceTokenRow = Database['public']['Tables']['device_tokens']['Row'];

export async function listMyNotifications(
  client: SupabaseClient<Database>,
  userId: string,
  options: Omit<ListOptions, 'filters'> & { unreadOnly?: boolean },
): Promise<ListResult<NotificationRow>> {
  const { unreadOnly, ...rest } = options;
  let query = client.from('notifications').select('*', { count: 'exact' }).eq('user_id', userId);
  if (unreadOnly) query = query.is('read_at', null);

  const from = (rest.page - 1) * rest.pageSize;
  const to = from + rest.pageSize - 1;
  query = query
    .order(rest.sortBy ?? 'created_at', { ascending: rest.sortDir === 'asc' })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) throw AppError.internal(error.message);
  return {
    items: (data ?? []) as NotificationRow[],
    page: rest.page,
    pageSize: rest.pageSize,
    total: count ?? 0,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / rest.pageSize)),
  };
}

export async function markNotificationRead(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await client
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw AppError.internal(error.message);
}

export async function registerDeviceToken(
  client: SupabaseClient<Database>,
  userId: string,
  input: RegisterDeviceTokenInput,
): Promise<DeviceTokenRow> {
  const values = parseOrThrow(registerDeviceTokenSchema, input);
  const { data, error } = await client
    .from('device_tokens')
    .upsert({ ...values, user_id: userId, is_active: true }, { onConflict: 'user_id,token' })
    .select('*')
    .single();
  if (error) throw AppError.internal(error.message);
  return data;
}

export async function deactivateDeviceToken(
  client: SupabaseClient<Database>,
  token: string,
): Promise<void> {
  const { error } = await client
    .from('device_tokens')
    .update({ is_active: false })
    .eq('token', token);
  if (error) throw AppError.internal(error.message);
}

export async function listMyDeviceTokens(
  client: SupabaseClient<Database>,
  userId: string,
  options: Omit<ListOptions, 'filters'>,
): Promise<ListResult<DeviceTokenRow>> {
  return listRows<DeviceTokenRow>(client, 'device_tokens', {
    ...options,
    filters: { user_id: userId },
  });
}
