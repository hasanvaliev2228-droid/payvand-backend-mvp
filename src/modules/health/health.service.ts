/**
 * Health records module (weight, blood pressure, medicine, notes).
 * Security note: RLS (health_records_owner_all) scopes rows to user_id.
 * This module never derives medical advice — it is pure storage/retrieval.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import {
  deleteRowById,
  getRowById,
  insertRow,
  listRows,
  updateRowById,
} from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import {
  createHealthRecordSchema,
  updateHealthRecordSchema,
  type CreateHealthRecordInput,
  type UpdateHealthRecordInput,
} from '../../schemas/health.schema';
import type { ListResult } from '../../types/api.types';

type HealthRecordRow = Database['public']['Tables']['health_records']['Row'];

export async function listMyHealthRecords(
  client: SupabaseClient<Database>,
  userId: string,
  options: Omit<ListOptions, 'filters'> & { record_type?: string },
): Promise<ListResult<HealthRecordRow>> {
  const { record_type, ...rest } = options;
  return listRows<HealthRecordRow>(client, 'health_records', {
    ...rest,
    filters: { user_id: userId, record_type },
  });
}

export async function getMyHealthRecord(
  client: SupabaseClient<Database>,
  id: string,
): Promise<HealthRecordRow> {
  return getRowById<HealthRecordRow>(client, 'health_records', id);
}

export async function createHealthRecord(
  client: SupabaseClient<Database>,
  userId: string,
  input: CreateHealthRecordInput,
): Promise<HealthRecordRow> {
  const values = parseOrThrow(createHealthRecordSchema, input);
  return insertRow<HealthRecordRow>(client, 'health_records', { ...values, user_id: userId });
}

export async function updateHealthRecord(
  client: SupabaseClient<Database>,
  id: string,
  input: UpdateHealthRecordInput,
): Promise<HealthRecordRow> {
  const values = parseOrThrow(updateHealthRecordSchema, input);
  return updateRowById<HealthRecordRow>(client, 'health_records', id, values);
}

export async function deleteHealthRecord(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  return deleteRowById(client, 'health_records', id);
}
