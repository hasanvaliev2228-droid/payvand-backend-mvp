// supabase/functions/update-note/index.ts
// Deno Edge Function. Authenticated. Updates a note. Ownership is enforced
// twice: RLS (notes_owner_all) rejects the UPDATE at the database level for
// a non-owned id (the row simply won't match, PostgREST returns no row),
// and this function additionally checks the row existed post-update to
// return a clean 404 instead of an ambiguous 200 with null data.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const bodySchema = z.object({
  note_id: z.string().uuid(),
  title: z.string().trim().min(1).max(150).optional(),
  content: z.string().trim().max(20000).optional(),
  category: z.string().trim().max(80).optional(),
  is_private: z.boolean().optional(),
  reminder_at: z.string().datetime().nullable().optional(),
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

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.', details: parsed.error.flatten() } },
        422,
      );
    }
    const { note_id, ...updates } = parsed.data;

    if (Object.keys(updates).length === 0) {
      return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Ҳеҷ майдоне барои навсозӣ дода нашудааст.' } }, 422);
    }

    // Explicit ownership check up front for a clean 403/404 distinction
    // (RLS alone would just return zero rows from the update, which reads
    // the same whether the note doesn't exist or belongs to someone else —
    // this gives the caller a clearer signal without leaking which case it is).
    const { data: existing } = await supabase
      .from('notes')
      .select('id')
      .eq('id', note_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!existing) {
      return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Ёддошт ёфт нашуд.' } }, 404);
    }

    const { data: note, error: updateError } = await supabase
      .from('notes')
      .update(updates)
      .eq('id', note_id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (updateError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: updateError.message } }, 500);
    }

    return json({ ok: true, data: note }, 200);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
