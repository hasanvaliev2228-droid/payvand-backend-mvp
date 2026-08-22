// supabase/functions/delete-account/index.ts
// Deno Edge Function. Authenticated. Requires an explicit confirmation
// field (not just a bearer token) so a stray/duplicate request can never
// silently delete an account. Deletes only the caller's own data — never
// touches other users' rows. Runs under the service role because
// auth.admin.deleteUser() requires it.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const bodySchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'Барои тасдиқ бояд confirm: true фиристода шавад.' }),
  }),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Storage buckets that may hold this user's files, keyed by their
// {user_id}/... path prefix convention.
const USER_SCOPED_BUCKETS = ['avatars', 'documents', 'chat-files', 'qr-images'] as const;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await anon.auth.getUser();
    if (userError || !userData.user) {
      return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Ворид нашудаед.' } }, 401);
    }
    const userId = userData.user.id;

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Тасдиқ лозим аст.' } }, 422);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Audit BEFORE deleting, since the actor row itself is about to disappear.
    await admin.from('audit_logs').insert({
      actor_id: userId,
      action: 'delete_account_requested',
      entity_type: 'profile',
      entity_id: userId,
      metadata: {},
    });

    // Remove this user's storage objects across every user-scoped bucket.
    for (const bucket of USER_SCOPED_BUCKETS) {
      const { data: objects } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
      if (objects && objects.length > 0) {
        // list() only returns top-level entries; for nested {resource}/{file}
        // layouts we recurse one level, matching the storage path convention
        // {user_id}/{resource_id}/{random_uuid}.{ext}.
        const paths: string[] = [];
        for (const obj of objects) {
          if (obj.id === null) {
            // it's a "directory" (resource_id folder)
            const { data: nested } = await admin.storage
              .from(bucket)
              .list(`${userId}/${obj.name}`, { limit: 1000 });
            for (const n of nested ?? []) {
              paths.push(`${userId}/${obj.name}/${n.name}`);
            }
          } else {
            paths.push(`${userId}/${obj.name}`);
          }
        }
        if (paths.length > 0) {
          await admin.storage.from(bucket).remove(paths);
        }
      }
    }

    // Deleting the auth.users row cascades to `profiles` and, transitively
    // (via ON DELETE CASCADE across the schema), to nearly all other
    // user-owned tables. Rows with ON DELETE SET NULL (e.g.
    // service_providers.owner_id, categories.user_id via is_system logic)
    // are intentionally preserved rather than deleted, since they may be
    // referenced by / visible to other users.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: deleteError.message } }, 500);
    }

    return json({ ok: true, data: { deleted: true } }, 200);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
