/**
 * Categories module (system + user-defined).
 * Security note: RLS lets everyone read system categories, but only the
 * owner may insert/update/delete their own custom ones (is_system = false
 * is enforced both in the Zod schema layer and again by the DB check
 * constraint categories_owner_check).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import { deleteRowById, insertRow, listRows, updateRowById } from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import {
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '../../schemas/transaction.schema';
import type { ListResult } from '../../types/api.types';

type CategoryRow = Database['public']['Tables']['categories']['Row'];

export async function listCategories(
  client: SupabaseClient<Database>,
  options: Omit<ListOptions, 'filters'> & { type?: 'income' | 'expense' },
): Promise<ListResult<CategoryRow>> {
  const { type, ...rest } = options;
  // RLS already scopes rows to (system OR own); no user_id filter needed here.
  return listRows<CategoryRow>(client, 'categories', {
    ...rest,
    filters: { type },
  });
}

export async function createCategory(
  client: SupabaseClient<Database>,
  userId: string,
  input: CreateCategoryInput,
): Promise<CategoryRow> {
  const values = parseOrThrow(createCategorySchema, input);
  return insertRow<CategoryRow>(client, 'categories', {
    ...values,
    user_id: userId,
    is_system: false,
  });
}

export async function updateCategory(
  client: SupabaseClient<Database>,
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryRow> {
  const values = parseOrThrow(updateCategorySchema, input);
  return updateRowById<CategoryRow>(client, 'categories', id, values);
}

export async function deleteCategory(client: SupabaseClient<Database>, id: string): Promise<void> {
  return deleteRowById(client, 'categories', id);
}
