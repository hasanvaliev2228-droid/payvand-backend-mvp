/**
 * SERVICE-ROLE Supabase client. Bypasses Row Level Security entirely.
 *
 * SECURITY: this file must only ever be imported from:
 *   - supabase/functions/**  (Edge Functions, server-side runtime)
 *   - trusted server-side scripts (migrations, seeding, admin CLI tools)
 *
 * It must NEVER be imported by anything bundled into the mobile/frontend
 * app. There is no build-time enforcement possible here, so this boundary is
 * also covered by tests/edge-functions.test.ts, which greps the client-safe
 * module graph for accidental service-role usage.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../config/env';
import type { Database } from '../types/database.types';

let adminClient: SupabaseClient<Database> | undefined;

export function getSupabaseAdminClient(): SupabaseClient<Database> {
  const env = getEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. The admin client must only run server-side ' +
        '(Edge Functions) where this secret is injected by the Supabase runtime.',
    );
  }
  if (!adminClient) {
    adminClient = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
