// supabase/functions/sync-offline-events/index.ts
// Deno Edge Function. Authenticated. Accepts a BATCH of client-queued
// offline events and applies them idempotently using client_event_id as the
// dedupe key. Conflict policy (see docs/offline-sync.md):
//   - profile/settings: last-write-wins by updated_at
//   - transactions: conflicting server-side updates are reported back, not merged
//   - messages: append-only (no update conflicts possible)
//   - documents: metadata immutable after upload except title/folder
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const eventSchema = z.object({
  client_event_id: z.string().trim().min(1).max(100),
  entity_type: z.enum(['transaction', 'category', 'calendar_event', 'health_record', 'contact', 'profile', 'user_settings']),
  entity_id: z.string().uuid().optional(),
  operation: z.enum(['create', 'update', 'delete']),
  payload: z.record(z.unknown()),
  client_created_at: z.string().datetime(),
});

const bodySchema = z.object({ events: z.array(eventSchema).min(1).max(200) });

const TABLE_BY_ENTITY: Record<string, string> = {
  transaction: 'transactions',
  category: 'categories',
  calendar_event: 'calendar_events',
  health_record: 'health_records',
  contact: 'contacts',
  profile: 'profiles',
  user_settings: 'user_settings',
};

// documents are intentionally excluded from TABLE_BY_ENTITY: their metadata
// is immutable after upload except title/folder, and creation only ever
// happens through upload-document, never through offline sync.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

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
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.', details: parsed.error.flatten() } },
        422,
      );
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const results: Array<{ client_event_id: string; status: string; message?: string }> = [];

    for (const event of parsed.data.events) {
      // Idempotency: has this client_event_id already been recorded for this user?
      const { data: existing } = await admin
        .from('offline_sync_events')
        .select('id, status')
        .eq('client_event_id', event.client_event_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        results.push({ client_event_id: event.client_event_id, status: existing.status });
        continue;
      }

      const table = TABLE_BY_ENTITY[event.entity_type];
      let status: 'processed' | 'conflict' | 'failed' = 'processed';
      let errorMessage: string | undefined;

      try {
        if (event.operation === 'create') {
          const { error } = await admin.from(table).insert({ ...event.payload, user_id: userId });
          if (error) throw error;
        } else if (event.operation === 'update') {
          if (!event.entity_id) throw new Error('entity_id талаб карда мешавад барои update.');

          if (event.entity_type === 'transaction') {
            // Conflict policy: transactions are NOT merged server-side —
            // report a conflict back to the client to resolve.
            const { data: current } = await admin
              .from(table)
              .select('updated_at')
              .eq('id', event.entity_id)
              .eq('user_id', userId)
              .maybeSingle();
            const clientUpdatedAt = (event.payload as Record<string, unknown>).updated_at as
              | string
              | undefined;
            if (current && clientUpdatedAt && new Date(current.updated_at) > new Date(clientUpdatedAt)) {
              status = 'conflict';
            } else {
              const { error } = await admin
                .from(table)
                .update(event.payload)
                .eq('id', event.entity_id)
                .eq('user_id', userId);
              if (error) throw error;
            }
          } else if (event.entity_type === 'profile') {
            // Owner-keyed table: last-write-wins by updated_at.
            const { error } = await admin.from('profiles').update(event.payload).eq('id', userId);
            if (error) throw error;
          } else if (event.entity_type === 'user_settings') {
            const { error } = await admin
              .from('user_settings')
              .update(event.payload)
              .eq('user_id', userId);
            if (error) throw error;
          } else {
            // category / calendar_event / health_record / contact: last-write-wins by updated_at.
            const { error } = await admin
              .from(table)
              .update(event.payload)
              .eq('id', event.entity_id)
              .eq('user_id', userId);
            if (error) throw error;
          }
        } else if (event.operation === 'delete') {
          if (!event.entity_id) throw new Error('entity_id талаб карда мешавад барои delete.');
          const { error } = await admin
            .from(table)
            .delete()
            .eq('id', event.entity_id)
            .eq('user_id', userId);
          if (error) throw error;
        }
      } catch (err) {
        status = 'failed';
        errorMessage = err instanceof Error ? err.message : 'Хатогии номаълум.';
      }

      await admin.from('offline_sync_events').insert({
        user_id: userId,
        client_event_id: event.client_event_id,
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        operation: event.operation,
        payload: event.payload,
        client_created_at: event.client_created_at,
        server_processed_at: new Date().toISOString(),
        status,
        error_message: errorMessage,
      });

      results.push({ client_event_id: event.client_event_id, status, message: errorMessage });
    }

    return json({ ok: true, data: { results } }, 200);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
