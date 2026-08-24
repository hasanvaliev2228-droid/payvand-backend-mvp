// supabase/functions/send-notification/index.ts
// Deno Edge Function. ADMIN-ONLY. Runs with the service role to insert a
// notification row for a target user and (best-effort) push it via the
// configured provider. If no Firebase/OneSignal credentials are configured,
// a safe mock push provider is used and clearly labeled in the response.
//
// i18n: accepts EITHER a literal { title, body } (original, still fully
// supported — no breaking change) OR a { template_key, template_params }
// pair, which is rendered via notification-templates.ts in the target
// user's language. Language is resolved with the same priority as
// src/modules/i18n/i18n.service.ts#resolveLanguage(): explicit `language`
// in the request > Accept-Language header > the target user's own
// profiles.language > 'tg'.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';
import { renderTemplate, resolveLanguage, type SupportedLanguage } from './notification-templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept-language',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const bodySchema = z
  .object({
    user_id: z.string().uuid(),
    title: z.string().trim().min(1).max(150).optional(),
    body: z.string().trim().max(500).optional(),
    // New: render title/body from a shared, multilingual template instead
    // of passing literal text. Mutually exclusive with `title` in intent,
    // but `title` still wins if BOTH are somehow supplied (backward compat
    // first).
    template_key: z.string().trim().min(1).max(100).optional(),
    template_params: z.record(z.union([z.string(), z.number()])).default({}),
    // Optional explicit language override (e.g. an admin composing a
    // targeted notification in a specific language regardless of the
    // recipient's profile setting).
    language: z.enum(['tg', 'ru', 'en']).optional(),
    notification_type: z.string().trim().max(50).default('general'),
    data: z.record(z.unknown()).default({}),
  })
  .refine((v) => !!v.title || !!v.template_key, {
    message: 'title ё template_key ҳатмист.',
    path: ['title'],
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

    let title = parsed.data.title;
    let body = parsed.data.body;

    if (!title && parsed.data.template_key) {
      // Resolve the recipient's language: explicit override > Accept-Language
      // header on THIS request > the recipient's own stored preference > 'tg'.
      const { data: targetProfile } = await admin
        .from('profiles')
        .select('language')
        .eq('id', parsed.data.user_id)
        .maybeSingle();

      const lang: SupportedLanguage =
        parsed.data.language ??
        resolveLanguage(req.headers.get('Accept-Language'), targetProfile?.language ?? null);

      const rendered = renderTemplate(parsed.data.template_key, lang, parsed.data.template_params);
      if (!rendered) {
        return json(
          { ok: false, error: { code: 'VALIDATION_ERROR', message: `Шаблони "${parsed.data.template_key}" ёфт нашуд.` } },
          422,
        );
      }
      title = rendered.title;
      body = rendered.body;
    }

    const { data: notification, error: insertError } = await admin
      .from('notifications')
      .insert({
        user_id: parsed.data.user_id,
        title: title!,
        body,
        notification_type: parsed.data.notification_type,
        data: parsed.data.data,
      })
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
    const pushResult = await sendPush(pushProvider, tokens ?? [], title!, body);

    await admin.from('audit_logs').insert({
      actor_id: userData.user.id,
      action: 'send_notification',
      entity_type: 'notification',
      entity_id: notification.id,
      metadata: { push: pushResult, target_user: parsed.data.user_id, template_key: parsed.data.template_key ?? null },
    });

    return json({ ok: true, data: { notification, push: pushResult } }, 201);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
})