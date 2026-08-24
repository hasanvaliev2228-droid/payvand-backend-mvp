// supabase/functions/notify-security-event/index.ts
// Deno Edge Function. AUTHENTICATED (self-service). Lets the client record
// a security-relevant event about the CALLER'S OWN account — e.g. right
// after a successful OTP verification ("new sign-in"), or when the client
// detects something worth flagging locally. Always inserts a notification
// for auth.getUser()'s own id — never an arbitrary user_id from the
// request body — so a caller can never spoof a notification for someone
// else.
//
// Security note: regular users have NO insert policy on `notifications`
// (see notifications_admin_insert in 014_rls_policies.sql — insert is
// admin-only). This function therefore uses the service-role client, which
// is necessary here specifically because the row being created is a
// SYSTEM-GENERATED notification about the caller's own account, not
// user-authored content, and the target user_id is hard-pinned to the
// verified caller (never taken from the request body).
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';
import { renderTemplate, resolveLanguage, type SupportedLanguage } from '../send-notification/notification-templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept-language',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Deliberately a small, fixed enum — a caller can only ever trigger one of
// these known-safe self-notifications, never an arbitrary template_key.
const eventTypeSchema = z.enum(['new_login', 'security_alert']);

const bodySchema = z.object({
  event_type: eventTypeSchema,
  language: z.enum(['tg', 'ru', 'en']).optional(),
});

const TEMPLATE_KEY_BY_EVENT: Record<z.infer<typeof eventTypeSchema>, string> = {
  new_login: 'security.new_login',
  security_alert: 'security.alert',
};

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

    const { data: profile } = await admin.from('profiles').select('language').eq('id', userId).maybeSingle();
    const lang: SupportedLanguage =
      parsed.data.language ?? resolveLanguage(req.headers.get('Accept-Language'), profile?.language ?? null);

    const templateKey = TEMPLATE_KEY_BY_EVENT[parsed.data.event_type];
    const rendered = renderTemplate(templateKey, lang);
    if (!rendered) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Шаблон ёфт нашуд.' } }, 500);
    }

    const { data: notification, error: insertError } = await admin
      .from('notifications')
      .insert({
        user_id: userId, // always the verified caller — never from the request body
        title: rendered.title,
        body: rendered.body,
        notification_type: parsed.data.event_type,
        data: { self_reported: true },
      })
      .select('*')
      .single();
    if (insertError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: insertError.message } }, 500);
    }

    await admin.from('audit_logs').insert({
      actor_id: userId,
      action: 'notify_security_event',
      entity_type: 'notification',
      entity_id: notification.id,
      metadata: { event_type: parsed.data.event_type },
    });

    return json({ ok: true, data: notification }, 201);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
