// supabase/functions/delete-note/index.ts
// Deno Edge Function. Authenticated. Deletes a note the caller owns.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const bodySchema = z.object({ note_id: z.string().uuid() });

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

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.', details: parsed.error.flatten() } },
        422,
      );
    }

    const { data: existing } = await supabase
      .from('notes')
      .select('id')
      .eq('id', parsed.data.note_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!existing) {
      return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Ёддошт ёфт нашуд.' } }, 404);
    }

    const { error: deleteError } = await supabase
      .from('notes')
      .delete()
      .eq('id', parsed.data.note_id)
      .eq('user_id', userId);
    if (deleteError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: deleteError.message } }, 500);
    }

    return json({ ok: true, data: { deleted: true } }, 200);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
