/**
 * Browser/mobile-safe Supabase client. Uses the ANON key only — this is the
 * client that ships inside the frontend app and is subject to RLS on every
 * query. NEVER import supabase-admin.ts from frontend-reachable code.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../config/env';
import type { Database } from '../types/database.types';

let client: SupabaseClient<Database> | undefined;

export function getSupabaseClient(accessToken?: string): SupabaseClient<Database> {
  const env = getEnv();
  if (!client) {
    client = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  if (accessToken) {
    // Attach the end-user's JWT so RLS policies evaluate auth.uid() correctly.
    client.realtime.setAuth(accessToken);
    return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }
  return client;
}
