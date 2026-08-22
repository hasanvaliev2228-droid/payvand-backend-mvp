/**
 * Generic CRUD repository for Supabase.
 *
 * Security:
 * - Always uses the caller's Supabase client.
 * - NEVER uses the service-role client.
 * - RLS remains the actual security boundary.
 *
 * The repository intentionally uses a local typed escape hatch for dynamic
 * table names. Supabase's strongly typed `.from()` cannot infer a table when
 * the table name is only known at runtime, which otherwise produces `never`
 * for insert/update payloads.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './errors';
import { buildPageMeta, toRange, type PaginationInput } from './pagination';
import type { ListResult } from '../types/api.types';
import type { Database } from '../types/database.types';

export interface ListOptions extends PaginationInput {
  filters?: Record<string, string | number | boolean | undefined>;
}

/**
 * Supabase's generated types are excellent when table names are literals.
 * This repository accepts runtime table names, so we use a local dynamic
 * client type here instead of allowing Supabase to infer `never`.
 *
 * This does NOT bypass RLS. The actual client instance is still the caller's
 * JWT/anon client.
 */
type PublicTables = Database['public']['Tables'];
export type TableName = keyof PublicTables & string;
type TableRow<T extends TableName> = PublicTables[T]['Row'];
type TableInsert<T extends TableName> = PublicTables[T]['Insert'];
type TableUpdate<T extends TableName> = PublicTables[T]['Update'];
type DbClient = SupabaseClient<Database>;

/** Maps a row type back to its table, preserving the existing repository API. */
type TableForRow<Row> = {
  [T in TableName]: Row extends TableRow<T> ? T : never;
}[TableName];

/**
 * List rows with pagination, filters and sorting.
 */
export async function listRows<Row extends TableRow<TableName>>(
  client: DbClient,
  table: TableForRow<Row>,
  options: ListOptions,
): Promise<ListResult<Row>> {
  const { page, pageSize, sortBy, sortDir, filters } = options;

  let query = client.from(table).select('*', { count: 'exact' });

  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined) {
        continue;
      }

      // `key` is runtime input, while Supabase requires a compile-time column
      // literal for a generic table. The public API keeps these values typed;
      // this narrow cast is only the library boundary.
      query = query.eq(key as never, value as never);
    }
  }

  const [from, to] = toRange(page, pageSize);

  query = query
    .order(sortBy ?? 'created_at', {
      ascending: sortDir === 'asc',
    })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw AppError.internal(error.message);
  }

  return {
    items: (data ?? []) as unknown as Row[],
    ...buildPageMeta(page, pageSize, count ?? 0),
  };
}

/**
 * Get a single row by id.
 */
export async function getRowById<Row extends TableRow<TableName>>(
  client: DbClient,
  table: TableForRow<Row>,
  id: string,
): Promise<Row> {
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq('id' as never, id as never)
    .maybeSingle();

  if (error) {
    throw AppError.internal(error.message);
  }

  if (!data) {
    throw AppError.notFound();
  }

  return data as unknown as Row;
}

/**
 * Insert a row.
 */
export async function insertRow<Row extends TableRow<TableName>>(
  client: DbClient,
  table: TableForRow<Row>,
  values: TableInsert<TableForRow<Row>>,
): Promise<Row> {
  const { data, error } = await client
    .from(table)
    .insert(values as never)
    .select('*')
    .single();

  if (error) {
    throw AppError.internal(error.message);
  }

  return data as unknown as Row;
}

/**
 * Update a row by id.
 */
export async function updateRowById<Row extends TableRow<TableName>>(
  client: DbClient,
  table: TableForRow<Row>,
  id: string,
  values: TableUpdate<TableForRow<Row>>,
): Promise<Row> {
  const { data, error } = await client
    .from(table)
    .update(values as never)
    .eq('id' as never, id as never)
    .select('*')
    .maybeSingle();

  if (error) {
    throw AppError.internal(error.message);
  }

  if (!data) {
    throw AppError.notFound();
  }

  return data as unknown as Row;
}

/**
 * Delete a row by id.
 */
export async function deleteRowById(client: DbClient, table: TableName, id: string): Promise<void> {
  const { error, count } = await client
    .from(table)
    .delete({ count: 'exact' })
    .eq('id' as never, id as never);

  if (error) {
    throw AppError.internal(error.message);
  }

  if (!count) {
    throw AppError.notFound();
  }
}
