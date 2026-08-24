/**
 * Generic, typed CRUD helper shared by every module. Each module supplies
 * its table name, row type, and the owner column RLS already enforces
 * ownership on the database side; this helper adds pagination, filtering,
 * sorting, and consistent error handling on top of a plain PostgREST query.
 *
 * Security note: this helper NEVER uses the service-role client. It always
 * takes a SupabaseClient that was constructed with the caller's JWT, so
 * every query still goes through Row Level Security. Ownership filters here
 * are a defense-in-depth / query-efficiency convenience, not the security
 * boundary — RLS is the actual boundary (see supabase/migrations/014_rls_policies.sql).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './errors';
import { buildPageMeta, toRange, type PaginationInput } from './pagination';
import type { ListResult } from '../types/api.types';
import { DEFAULT_LANGUAGE, t, type SupportedLanguage } from '../modules/i18n/i18n.service';

export interface ListOptions extends PaginationInput {
  filters?: Record<string, string | number | boolean | undefined>;
}

export async function listRows<Row extends Record<string, unknown>>(
  client: SupabaseClient,
  table: string,
  options: ListOptions,
): Promise<ListResult<Row>> {
  const { page, pageSize, sortBy, sortDir, filters } = options;
  let query = client.from(table).select('*', { count: 'exact' });

  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined) continue;
      query = query.eq(key, value);
    }
  }

  const [from, to] = toRange(page, pageSize);
  query = query.order(sortBy ?? 'created_at', { ascending: sortDir === 'asc' }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw AppError.internal(error.message);

  return {
    items: (data ?? []) as Row[],
    ...buildPageMeta(page, pageSize, count ?? 0),
  };
}

export async function getRowById<Row>(
  client: SupabaseClient,
  table: string,
  id: string,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): Promise<Row> {
  const { data, error } = await client.from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw AppError.internal(error.message);
  if (!data) throw AppError.notFound(t(lang, 'common.not_found'));
  return data as Row;
}

export async function insertRow<Row>(
  client: SupabaseClient,
  table: string,
  values: Record<string, unknown>,
): Promise<Row> {
  const { data, error } = await client.from(table).insert(values).select('*').single();
  if (error) throw AppError.internal(error.message);
  return data as Row;
}

export async function updateRowById<Row>(
  client: SupabaseClient,
  table: string,
  id: string,
  values: Record<string, unknown>,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): Promise<Row> {
  const { data, error } = await client
    .from(table)
    .update(values)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw AppError.internal(error.message);
  if (!data) throw AppError.notFound(t(lang, 'common.not_found'));
  return data as Row;
}

export async function deleteRowById(
  client: SupabaseClient,
  table: string,
  id: string,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): Promise<void> {
  const { error, count } = await client
    .from(table)
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) throw AppError.internal(error.message);
  if (!count) throw AppError.notFound(t(lang, 'common.not_found'));
}
