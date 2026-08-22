/**
 * QR / barcode module.
 * Security note: RLS (qr_codes_owner_all) restricts every row to its owner.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import {
  deleteRowById,
  getRowById,
  insertRow,
  listRows,
} from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import { createQrSchema, type CreateQrInput } from '../../schemas/card.schema';
import type { ListResult } from '../../types/api.types';

type QrRow = Database['public']['Tables']['qr_codes']['Row'];

export async function listMyQrCodes(
  client: SupabaseClient<Database>,
  userId: string,
  options: Omit<ListOptions, 'filters'>,
): Promise<ListResult<QrRow>> {
  return listRows<QrRow>(client, 'qr_codes', { ...options, filters: { user_id: userId } });
}

export async function getQrCode(client: SupabaseClient<Database>, id: string): Promise<QrRow> {
  return getRowById<QrRow>(client, 'qr_codes', id);
}

export async function createQrCode(
  client: SupabaseClient<Database>,
  userId: string,
  input: CreateQrInput,
): Promise<QrRow> {
  const values = parseOrThrow(createQrSchema, input);
  return insertRow<QrRow>(client, 'qr_codes', { ...values, user_id: userId });
}

export async function deleteQrCode(client: SupabaseClient<Database>, id: string): Promise<void> {
  return deleteRowById(client, 'qr_codes', id);
}

/**
 * Example:
 *   await createQrCode(supabase, userId, { title: 'Пардохт', qr_type: 'payment_request', payload: '...' });
 * For actual QR image generation, see supabase/functions/create-qr, which
 * calls this service and then (optionally) renders + uploads an image.
 */
