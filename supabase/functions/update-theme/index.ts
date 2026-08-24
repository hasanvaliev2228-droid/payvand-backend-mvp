// supabase/functions/update-theme/index.ts
// Deno Edge Function. Authenticated. Dedicated, focused endpoint for
// switching the caller's own theme preference ('light' | 'dark'), backed
// by the EXISTING user_settings.theme column (003_user_settings.sql) — no
// new table/migration. Uses the caller's own RLS-scoped client throughout;
// RLS (user_settings_owner_all) is the real authorization boundary.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const bodySchema = z.object({
  theme: z.enum(['light', 'dark']),
});

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
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Ворид нашудаед.' } }, 401);
    }
    const userId = userData.user.id;

    // GET: return the caller's current theme (light/dark/system).
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('user_settings')
        .select('theme')
        .eq('user_id', userId)
        .single();
      if (error) {
        return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, 500);
      }
      return json({ ok: true, data: { theme: data.theme } }, 200);
    }

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.', details: parsed.error.flatten() } },
        422,
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from('user_settings')
      .update({ theme: parsed.data.theme })
      .eq('user_id', userId)
      .select('theme')
      .single();
    if (updateError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: updateError.message } }, 500);
    }

    return json({ ok: true, data: { theme: updated.theme } }, 200);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
