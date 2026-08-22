/**
 * Profile & user-settings module.
 *
 * Security note: every function requires a SupabaseClient scoped to the
 * caller's JWT. RLS (profiles_update_own) guarantees a user can never change
 * their own `role`, and can only ever read/update their own row (or, for
 * admins, any row via profiles_admin_all).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import { getRowById, updateRowById } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import {
  updateProfileSchema,
  updateUserSettingsSchema,
  type UpdateProfileInput,
  type UpdateUserSettingsInput,
} from '../../schemas/profile.schema';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type UserSettingsRow = Database['public']['Tables']['user_settings']['Row'];

export async function getMyProfile(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<ProfileRow> {
  return getRowById<ProfileRow>(client, 'profiles', userId);
}

export async function updateMyProfile(
  client: SupabaseClient<Database>,
  userId: string,
  input: UpdateProfileInput,
): Promise<ProfileRow> {
  const values = parseOrThrow(updateProfileSchema, input);
  return updateRowById<ProfileRow>(client, 'profiles', userId, values);
}

export async function getMySettings(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<UserSettingsRow> {
  const { data, error } = await client
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateMySettings(
  client: SupabaseClient<Database>,
  userId: string,
  input: UpdateUserSettingsInput,
): Promise<UserSettingsRow> {
  const values = parseOrThrow(updateUserSettingsSchema, input);
  const { data, error } = await client
    .from('user_settings')
    .update(values)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Example (frontend, pseudo-agnostic):
 *
 *   const profile = await getMyProfile(supabase, session.user.id);
 *   await updateMyProfile(supabase, session.user.id, { city: 'Душанбе' });
 */
