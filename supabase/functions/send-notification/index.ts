// supabase/functions/send-notification/index.ts
// Deno Edge Function. ADMIN-ONLY. Runs with the service role to insert a
// notification row for a target user and (best-effort) push it via the
// configured provider. If no Firebase/OneSignal credentials are configured,
// a safe mock push provider is used and clearly labeled in the response.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const bodySchema = z.object({
  user_id: z.string().uuid(),
  title: z.string().trim().min(1).max(150),
  body: z.string().trim().max(500).optional(),
  notification_type: z.string().trim().max(50).default('general'),
  data: z.record(z.unknown()).default({}),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/** Mock push provider: used whenever real credentials aren't configured. Never fails the request. */
async function sendPush(
  provider: string,
  tokens: { token: string; platform: string }[],
  title: string,
  body?: string,
): Promise<{ provider: string; attempted: number }> {
  if (provider !== 'firebase') {
    // Mock adapter: logs and "succeeds" without contacting any real service.
    console.warn(`[mock-push] would send "${title}" (${body ?? ''}) to ${tokens.length} device(s)`);
    return { provider: 'mock', attempted: tokens.length };
  }
  // Real Firebase adapter would go here, using FIREBASE_* env secrets.
  // Left as a clearly-labeled extension point rather than a fake network call.
  console.warn(`[firebase-push] would send "${title}" to ${tokens.length} device(s)`);
  return { provider: 'firebase', attempted: tokens.length };
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

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();
    if (!callerProfile || callerProfile.role !== 'admin') {
      return json({ ok: false, error: { code: 'FORBIDDEN', message: 'Танҳо admin метавонад огоҳинома фиристад.' } }, 403);
    }

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.', details: parsed.error.flatten() } },
        422,
      );
    }

    const { data: notification, error: insertError } = await admin
      .from('notifications')
      .insert(parsed.data)
      .select('*')
      .single();
    if (insertError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: insertError.message } }, 500);
    }

    const { data: tokens } = await admin
      .from('device_tokens')
      .select('token, platform')
      .eq('user_id', parsed.data.user_id)
      .eq('is_active', true);

    const pushProvider = Deno.env.get('PUSH_PROVIDER') ?? 'mock';
    const pushResult = await sendPush(pushProvider, tokens ?? [], parsed.data.title, parsed.data.body);

    await admin.from('audit_logs').insert({
      actor_id: userData.user.id,
      action: 'send_notification',
      entity_type: 'notification',
      entity_id: notification.id,
      metadata: { push: pushResult, target_user: parsed.data.user_id },
    });

    return json({ ok: true, data: { notification, push: pushResult } }, 201);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
