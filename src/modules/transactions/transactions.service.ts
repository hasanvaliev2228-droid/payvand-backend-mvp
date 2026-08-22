/**
 * Transactions module (income / expense / transfer).
 * Security note: RLS (transactions_owner_all) restricts all access to the
 * owning user; amount > 0 is enforced by both Zod and a DB check constraint.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import { deleteRowById, getRowById, insertRow, updateRowById } from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import {
  createTransactionSchema,
  transactionFilterSchema,
  updateTransactionSchema,
  type CreateTransactionInput,
  type TransactionFilterInput,
  type UpdateTransactionInput,
} from '../../schemas/transaction.schema';
import type { ListResult } from '../../types/api.types';
import { AppError } from '../../lib/errors';

type TransactionRow = Database['public']['Tables']['transactions']['Row'];

export async function listMyTransactions(
  client: SupabaseClient<Database>,
  userId: string,
  options: Omit<ListOptions, 'filters'>,
  rawFilters: TransactionFilterInput = {},
): Promise<ListResult<TransactionRow>> {
  const filters = parseOrThrow(transactionFilterSchema, rawFilters);

  let query = client.from('transactions').select('*', { count: 'exact' }).eq('user_id', userId);

  if (filters.type) query = query.eq('type', filters.type);
  if (filters.category_id) query = query.eq('category_id', filters.category_id);
  if (filters.from) query = query.gte('transaction_date', filters.from);
  if (filters.to) query = query.lte('transaction_date', filters.to);

  const { page, pageSize, sortBy, sortDir } = options;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query
    .order(sortBy ?? 'transaction_date', { ascending: sortDir === 'asc' })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) throw AppError.internal(error.message);

  return {
    items: (data ?? []) as TransactionRow[],
    page,
    pageSize,
    total: count ?? 0,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  };
}

export async function getMyTransaction(
  client: SupabaseClient<Database>,
  id: string,
): Promise<TransactionRow> {
  return getRowById<TransactionRow>(client, 'transactions', id);
}

export async function createTransaction(
  client: SupabaseClient<Database>,
  userId: string,
  input: CreateTransactionInput,
): Promise<TransactionRow> {
  const values = parseOrThrow(createTransactionSchema, input);
  return insertRow<TransactionRow>(client, 'transactions', { ...values, user_id: userId });
}

export async function updateTransaction(
  client: SupabaseClient<Database>,
  id: string,
  input: UpdateTransactionInput,
): Promise<TransactionRow> {
  const values = parseOrThrow(updateTransactionSchema, input);
  return updateRowById<TransactionRow>(client, 'transactions', id, values);
}

export async function deleteTransaction(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  return deleteRowById(client, 'transactions', id);
}
