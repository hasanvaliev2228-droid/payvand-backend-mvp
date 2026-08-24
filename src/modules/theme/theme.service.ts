/**
 * Theme settings module — a thin, dedicated wrapper around the EXISTING
 * `user_settings.theme` column (003_user_settings.sql). No new table or
 * migration was needed: that column already stores 'light' | 'dark' |
 * 'system' with a default of 'system' and a NOT NULL + CHECK constraint.
 *
 * This module exists to give theme switching its own small, focused
 * surface (schema + service + Edge Function) as requested, without
 * touching or duplicating the broader user_settings CRUD already in
 * src/modules/profile/profile.service.ts.
 *
 * Security note: RLS (user_settings_owner_all, 014_rls_policies.sql)
 * scopes every row to user_id — a user can only ever read/set their own
 * theme. Uses the caller's own RLS-scoped client; no service role.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import { parseOrThrow } from '../../lib/validation';
import { AppError } from '../../lib/errors';
import { updateThemeSchema, type UpdateThemeInput } from './theme.schema';
import type { Theme, UserSettingsRow } from './theme.types';

export async function getMyTheme(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Theme | 'system'> {
  const { data, error } = await client
    .from('user_settings')
    .select('theme')
    .eq('user_id', userId)
    .single();
  if (error) throw AppError.internal(error.message);
  return data.theme as Theme | 'system';
}

export async function updateMyTheme(
  client: SupabaseClient<Database>,
  userId: string,
  input: UpdateThemeInput,
): Promise<UserSettingsRow> {
  const values = parseOrThrow(updateThemeSchema, input);
  const { data, error } = await client
    .from('user_settings')
    .update({ theme: values.theme })
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw AppError.internal(error.message);
  return data;
}

/**
 * Example:
 *   await updateMyTheme(supabase, userId, { theme: 'dark' });
 */
